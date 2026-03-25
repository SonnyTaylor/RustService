//! Service runner commands
//!
//! Tauri commands for running diagnostic and maintenance services.
//! This module delegates to the modular service system in `crate::services`.

use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::data_dir::get_data_dir_path;
use super::required_programs::validate_required_programs;
use super::settings::{get_settings, save_settings};
use sysinfo::Disks;

use crate::services;
use crate::types::{
    FindingSeverity, FindingSeverityCounts, ReportStatistics, ServiceDefinition, ServiceFinding,
    ServicePreset, ServiceQueueItem, ServiceReport, ServiceResult, ServiceRunState,
    ServiceRunStatus,
};

// =============================================================================
// Health Score Constants
// =============================================================================

const CRITICAL_FINDING_PENALTY: i32 = 30;
const ERROR_FINDING_PENALTY: i32 = 15;
const WARNING_FINDING_PENALTY: i32 = 5;
const SUCCESS_FINDING_BONUS: i32 = 2;
const HEALTH_SCORE_BASE: i32 = 100;

/// Milliseconds to wait before rechecking cancellation in parallel runner
const PARALLEL_POLL_INTERVAL_MS: u64 = 250;

/// Bytes per gigabyte (for display formatting)
const BYTES_PER_GB: f64 = 1_073_741_824.0;

/// Milliseconds per second (for duration formatting)
const MS_PER_SECOND: f64 = 1000.0;

// =============================================================================
// Global State for Persistent Service Runs
// =============================================================================

/// Global state for the currently running service
static SERVICE_STATE: Mutex<Option<ServiceRunState>> = Mutex::new(None);

/// Condition variable for pause/resume support
static PAUSE_CONDVAR: Condvar = Condvar::new();

// =============================================================================
// Report Storage
// =============================================================================

fn get_reports_dir() -> std::path::PathBuf {
    get_data_dir_path().join("reports")
}

fn save_report(report: &ServiceReport) -> Result<(), String> {
    let reports_dir = get_reports_dir();
    fs::create_dir_all(&reports_dir).map_err(|e| format!("Failed to create reports dir: {}", e))?;

    let file_path = reports_dir.join(format!("{}.json", report.id));
    let json = serde_json::to_string_pretty(report)
        .map_err(|e| format!("Failed to serialize report: {}", e))?;
    fs::write(file_path, json).map_err(|e| format!("Failed to write report: {}", e))?;

    Ok(())
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// List connected removable USB drives for the USB stability test service
#[tauri::command]
pub fn list_usb_drives() -> Vec<serde_json::Value> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .filter(|d| d.is_removable() && d.total_space() > 0)
        .map(|d| {
            let mount = d.mount_point().to_string_lossy().to_string();
            let name = d.name().to_string_lossy().to_string();
            let label = if name.is_empty() {
                "Removable Disk".to_string()
            } else {
                name
            };
            serde_json::json!({
                "mountPoint": mount.trim_end_matches('\\'),
                "name": label,
                "totalSpaceGb": d.total_space() as f64 / BYTES_PER_GB,
                "availableSpaceGb": d.available_space() as f64 / BYTES_PER_GB,
                "fileSystem": d.file_system().to_string_lossy().to_string(),
            })
        })
        .collect()
}

/// Get all available service definitions
#[tauri::command]
pub fn get_service_definitions() -> Vec<ServiceDefinition> {
    services::get_all_definitions()
}

/// Get all service presets (built-in merged with custom from settings)
#[tauri::command]
pub fn get_service_presets() -> Vec<ServicePreset> {
    // Get built-in presets
    let mut presets = services::get_all_presets();

    // Get custom presets from settings
    if let Ok(settings) = get_settings() {
        for custom_preset in settings.presets.custom_presets {
            // Check if this custom preset overrides a built-in one
            if let Some(pos) = presets.iter().position(|p| p.id == custom_preset.id) {
                // Replace built-in with custom
                presets[pos] = custom_preset;
            } else {
                // Add new custom preset
                presets.push(custom_preset);
            }
        }
    }

    presets
}

/// Save or update a service preset
#[tauri::command]
pub fn save_service_preset(preset: ServicePreset) -> Result<(), String> {
    let mut settings = get_settings()?;

    // Check if updating an existing custom preset
    if let Some(pos) = settings
        .presets
        .custom_presets
        .iter()
        .position(|p| p.id == preset.id)
    {
        settings.presets.custom_presets[pos] = preset;
    } else {
        // Add new custom preset
        settings.presets.custom_presets.push(preset);
    }

    save_settings(settings)?;
    Ok(())
}

/// Delete a custom service preset
#[tauri::command]
pub fn delete_service_preset(preset_id: String) -> Result<(), String> {
    let mut settings = get_settings()?;

    // Find and remove the preset
    let initial_len = settings.presets.custom_presets.len();
    settings
        .presets
        .custom_presets
        .retain(|p| p.id != preset_id);

    if settings.presets.custom_presets.len() == initial_len {
        return Err(format!("Custom preset not found: {}", preset_id));
    }

    save_settings(settings)?;
    Ok(())
}

/// Get the list of built-in preset IDs
#[tauri::command]
pub fn get_builtin_preset_ids() -> Vec<String> {
    services::get_all_presets()
        .into_iter()
        .map(|p| p.id)
        .collect()
}

/// Check if required programs are installed for given services
#[tauri::command]
pub fn validate_service_requirements(
    service_ids: Vec<String>,
) -> Result<HashMap<String, Vec<String>>, String> {
    let definitions = services::get_all_definitions();
    let def_map: HashMap<_, _> = definitions.iter().map(|d| (d.id.clone(), d)).collect();

    // Collect all required program IDs
    let mut all_required: Vec<String> = Vec::new();
    for service_id in &service_ids {
        if let Some(def) = def_map.get(service_id) {
            for req in &def.required_programs {
                if !all_required.contains(req) {
                    all_required.push(req.clone());
                }
            }
        }
    }

    // Validate using the new required programs system
    let validation = validate_required_programs(all_required)?;

    let mut missing: HashMap<String, Vec<String>> = HashMap::new();

    for service_id in service_ids {
        if let Some(def) = def_map.get(&service_id) {
            if def.required_programs.is_empty() {
                continue;
            }

            let mut service_missing: Vec<String> = Vec::new();
            for req in &def.required_programs {
                if let Some(&found) = validation.get(req) {
                    if !found {
                        service_missing.push(req.clone());
                    }
                } else {
                    // Unknown program ID
                    service_missing.push(req.clone());
                }
            }

            if !service_missing.is_empty() {
                missing.insert(service_id, service_missing);
            }
        }
    }

    Ok(missing)
}

/// Get current service run state
#[tauri::command]
pub fn get_service_run_state() -> ServiceRunState {
    let state = SERVICE_STATE.lock().unwrap();
    state.clone().unwrap_or_default()
}

/// Start running services
#[tauri::command]
pub async fn run_services(
    app: AppHandle,
    queue: Vec<ServiceQueueItem>,
    technician_name: Option<String>,
    customer_name: Option<String>,
    parallel: Option<bool>,
) -> Result<ServiceReport, String> {
    let parallel_mode = parallel.unwrap_or(false);

    // Check if already running
    {
        let state = SERVICE_STATE.lock().unwrap();
        if let Some(ref s) = *state {
            if s.is_running {
                return Err("A service run is already in progress".to_string());
            }
        }
    }

    // Filter to only enabled services and sort by order
    let mut enabled_queue: Vec<_> = queue.iter().filter(|q| q.enabled).cloned().collect();
    enabled_queue.sort_by_key(|q| q.order);

    if enabled_queue.is_empty() {
        return Err("No services enabled in queue".to_string());
    }

    // Validate dependency ordering
    {
        let all_defs = crate::services::get_all_definitions();
        let dep_map: HashMap<String, Vec<String>> = all_defs
            .into_iter()
            .map(|d| (d.id.clone(), d.dependencies))
            .collect();

        let mut seen_ids: HashSet<String> = HashSet::new();
        for item in &enabled_queue {
            let empty_deps = Vec::new();
            let deps = dep_map.get(&item.service_id).unwrap_or(&empty_deps);
            for dep in deps {
                let dep_in_queue = enabled_queue.iter().any(|q| q.service_id == *dep);
                if dep_in_queue && !seen_ids.contains(dep) {
                    return Err(format!(
                        "Service '{}' depends on '{}' which must come earlier in the queue",
                        item.service_id, dep
                    ));
                }
            }
            seen_ids.insert(item.service_id.clone());
        }
    }

    // Create report
    let report_id = Uuid::new_v4().to_string();
    let mut report = ServiceReport {
        id: report_id.clone(),
        started_at: Utc::now().to_rfc3339(),
        completed_at: None,
        status: ServiceRunStatus::Running,
        total_duration_ms: None,
        queue: queue.clone(),
        results: Vec::new(),
        current_service_index: Some(0),
        current_service_indices: vec![],
        parallel_mode,
        technician_name,
        customer_name,
        agent_initiated: false,
        agent_summary: None,
        health_score: None,
    };

    // Update global state
    {
        let mut state = SERVICE_STATE.lock().unwrap();
        *state = Some(ServiceRunState {
            is_running: true,
            is_paused: false,
            current_report: Some(report.clone()),
        });
    }

    // Emit initial state
    let _ = app.emit("service-state-changed", get_service_run_state());

    let start_time = Instant::now();

    if parallel_mode {
        // =====================================================================
        // Parallel Execution (Experimental)
        // Resource-based concurrent scheduler: services with overlapping
        // exclusive_resources are serialized; non-conflicting services run
        // concurrently on separate threads.
        // =====================================================================
        run_services_parallel(&app, &enabled_queue, &mut report)?;
    } else {
        // =====================================================================
        // Sequential Execution (Default)
        // =====================================================================
        run_services_sequential(&app, &enabled_queue, &mut report)?;
    }

    // Complete report
    report.completed_at = Some(Utc::now().to_rfc3339());
    // Check if we were cancelled
    let was_cancelled = {
        let state = SERVICE_STATE.lock().unwrap();
        state.as_ref().map(|s| !s.is_running).unwrap_or(false)
    };
    report.status = if was_cancelled {
        ServiceRunStatus::Cancelled
    } else if report.results.iter().all(|r| r.success) {
        ServiceRunStatus::Completed
    } else {
        ServiceRunStatus::Failed
    };
    report.total_duration_ms = Some(start_time.elapsed().as_millis() as u64);
    report.current_service_index = None;
    report.current_service_indices = vec![];

    // Save report
    if let Err(e) = save_report(&report) {
        eprintln!("Failed to save report: {}", e);
    }

    // Update global state
    {
        let mut state = SERVICE_STATE.lock().unwrap();
        *state = Some(ServiceRunState {
            is_running: false,
            is_paused: false,
            current_report: Some(report.clone()),
        });
    }

    // Emit completion
    let _ = app.emit("service-state-changed", get_service_run_state());
    let _ = app.emit("service-completed", &report);

    Ok(report)
}

// =============================================================================
// Sequential Runner
// =============================================================================

/// Run services one at a time (original behavior)
fn run_services_sequential(
    app: &AppHandle,
    enabled_queue: &[ServiceQueueItem],
    report: &mut ServiceReport,
) -> Result<(), String> {
    let total_count = enabled_queue.len();

    for (index, queue_item) in enabled_queue.iter().enumerate() {
        if is_cancelled() {
            break;
        }

        if wait_while_paused() {
            break;
        }

        update_current_index(index);
        emit_progress(app, index, total_count, &queue_item.service_id);

        // Run the service
        let result = services::run_service(&queue_item.service_id, &queue_item.options, app)
            .ok_or_else(|| format!("Unknown service: {}", queue_item.service_id))?;

        if result.success {
            record_service_metrics(queue_item, result.duration_ms);
        }

        report.results.push(result);

        sync_results_to_state(&report.results);
        let _ = app.emit("service-state-changed", get_service_run_state());
    }

    Ok(())
}

// =============================================================================
// Shared Runner Helpers
// =============================================================================

/// Check whether the service run has been cancelled.
fn is_cancelled() -> bool {
    let state = SERVICE_STATE.lock().unwrap();
    state.as_ref().is_some_and(|s| !s.is_running)
}

/// Block the current thread while the service run is paused.
/// Returns `true` if the run was cancelled while paused.
fn wait_while_paused() -> bool {
    let mut state = SERVICE_STATE.lock().unwrap();
    while state
        .as_ref()
        .is_some_and(|s| s.is_paused && s.is_running)
    {
        state = PAUSE_CONDVAR.wait(state).unwrap();
    }
    // Re-check cancellation after resuming
    state.as_ref().is_some_and(|s| !s.is_running)
}

/// Update the currently active service index in global state.
fn update_current_index(index: usize) {
    let mut state = SERVICE_STATE.lock().unwrap();
    if let Some(ref mut s) = *state {
        if let Some(ref mut r) = s.current_report {
            r.current_service_index = Some(index);
        }
    }
}

/// Update the active service indices (for parallel mode) in global state.
fn update_active_indices(indices: &[usize]) {
    let mut state = SERVICE_STATE.lock().unwrap();
    if let Some(ref mut s) = *state {
        if let Some(ref mut r) = s.current_report {
            r.current_service_indices = indices.to_vec();
            r.current_service_index = indices.first().copied();
        }
    }
}

/// Sync the latest results into global state.
fn sync_results_to_state(results: &[ServiceResult]) {
    let mut state = SERVICE_STATE.lock().unwrap();
    if let Some(ref mut s) = *state {
        if let Some(ref mut r) = s.current_report {
            r.results = results.to_vec();
        }
    }
}

/// Emit a service-progress event.
fn emit_progress(app: &AppHandle, index: usize, total_count: usize, service_id: &str) {
    let _ = app.emit(
        "service-progress",
        json!({
            "currentIndex": index,
            "totalCount": total_count,
            "serviceId": service_id
        }),
    );
}

/// Record service timing metrics for a successful result.
fn record_service_metrics(queue_item: &ServiceQueueItem, duration_ms: u64) {
    let options_hash = Some(super::time_tracking::compute_options_hash(
        &queue_item.options,
    ));
    if let Err(e) = super::time_tracking::record_service_time(
        queue_item.service_id.clone(),
        duration_ms,
        None,
        options_hash,
    ) {
        eprintln!("Failed to record service time: {}", e);
    }
}

/// Check whether a service can start (no resource conflicts, dependencies satisfied).
fn can_start_service(
    index: usize,
    queue_item: &ServiceQueueItem,
    resource_map: &HashMap<String, Vec<String>>,
    dep_map: &HashMap<String, Vec<String>>,
    held_resources: &HashSet<String>,
    completed: &HashSet<usize>,
    enabled_queue: &[ServiceQueueItem],
) -> bool {
    let service_resources = resource_map
        .get(&queue_item.service_id)
        .map(Vec::as_slice)
        .unwrap_or_default();

    // Check resource conflicts
    let has_conflict = service_resources.iter().any(|r| held_resources.contains(r));
    if has_conflict {
        return false;
    }

    // Check dependency satisfaction
    let deps = dep_map
        .get(&queue_item.service_id)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let deps_satisfied = deps.iter().all(|dep_id| {
        let dep_index = enabled_queue.iter().position(|q| q.service_id == *dep_id);
        dep_index.is_none_or(|idx| completed.contains(&idx))
    });

    let _ = index; // used for clarity at call sites
    deps_satisfied
}

// =============================================================================
// Parallel Runner (Experimental)
// =============================================================================

/// Run services concurrently, respecting exclusive resource constraints.
/// Services without overlapping exclusive_resources execute in parallel.
/// Services sharing any resource tag are serialized.
fn run_services_parallel(
    app: &AppHandle,
    enabled_queue: &[ServiceQueueItem],
    report: &mut ServiceReport,
) -> Result<(), String> {
    // Build maps of service_id -> exclusive_resources / dependencies
    let all_defs = services::get_all_definitions();
    let resource_map: HashMap<String, Vec<String>> = all_defs
        .iter()
        .map(|d| (d.id.clone(), d.exclusive_resources.clone()))
        .collect();
    let dep_map: HashMap<String, Vec<String>> = all_defs
        .iter()
        .map(|d| (d.id.clone(), d.dependencies.clone()))
        .collect();

    let total_count = enabled_queue.len();
    let results_collector: Arc<Mutex<Vec<(usize, ServiceResult)>>> =
        Arc::new(Mutex::new(Vec::new()));

    let mut started: HashSet<usize> = HashSet::new();
    let mut completed: HashSet<usize> = HashSet::new();
    let mut held_resources: HashSet<String> = HashSet::new();
    let mut running: Vec<(usize, Vec<String>, std::thread::JoinHandle<()>)> = Vec::new();

    let notify_pair = Arc::new((Mutex::new(false), Condvar::new()));

    loop {
        if is_cancelled() || completed.len() == total_count {
            break;
        }

        // Reap finished threads and release their resources
        let mut newly_completed = Vec::new();
        running.retain(|(idx, resources, handle)| {
            if handle.is_finished() {
                newly_completed.push((*idx, resources.clone()));
                false
            } else {
                true
            }
        });

        for (idx, resources) in &newly_completed {
            completed.insert(*idx);
            for res in resources {
                held_resources.remove(res);
            }
        }

        // Collect results from the shared collector
        {
            let mut collected = results_collector.lock().unwrap();
            for (idx, result) in collected.drain(..) {
                if result.success {
                    record_service_metrics(&enabled_queue[idx], result.duration_ms);
                }
                report.results.push(result);
            }
        }

        // Update state if anything changed
        if !newly_completed.is_empty() {
            let active_indices: Vec<usize> = running.iter().map(|(idx, _, _)| *idx).collect();
            sync_results_to_state(&report.results);
            update_active_indices(&active_indices);
            let _ = app.emit("service-state-changed", get_service_run_state());
        }

        // Launch eligible services
        let mut launched_any = false;
        for (index, queue_item) in enabled_queue.iter().enumerate() {
            if started.contains(&index) || is_cancelled() {
                continue;
            }

            if !can_start_service(
                index,
                queue_item,
                &resource_map,
                &dep_map,
                &held_resources,
                &completed,
                enabled_queue,
            ) {
                continue;
            }

            // Reserve resources and mark as started
            let service_resources = resource_map
                .get(&queue_item.service_id)
                .cloned()
                .unwrap_or_default();
            for res in &service_resources {
                held_resources.insert(res.clone());
            }
            started.insert(index);
            launched_any = true;

            emit_progress(app, index, total_count, &queue_item.service_id);

            let active_indices: Vec<usize> = running
                .iter()
                .map(|(idx, _, _)| *idx)
                .chain(std::iter::once(index))
                .collect();
            update_active_indices(&active_indices);
            let _ = app.emit("service-state-changed", get_service_run_state());

            // Spawn worker thread
            let results_tx = Arc::clone(&results_collector);
            let notify = Arc::clone(&notify_pair);
            let service_id = queue_item.service_id.clone();
            let options = queue_item.options.clone();
            let app_handle = app.clone();

            let handle = std::thread::spawn(move || {
                let result = services::run_service(&service_id, &options, &app_handle)
                    .unwrap_or_else(|| ServiceResult {
                        service_id: service_id.clone(),
                        success: false,
                        error: Some(format!("Unknown service: {}", service_id)),
                        duration_ms: 0,
                        findings: vec![],
                        logs: vec![],
                        agent_analysis: None,
                    });

                {
                    let mut collected = results_tx.lock().unwrap();
                    collected.push((index, result));
                }

                let (lock, cvar) = &*notify;
                let mut done = lock.lock().unwrap();
                *done = true;
                cvar.notify_one();
            });

            running.push((index, service_resources, handle));
        }

        // Wait or break if stuck
        if !launched_any && !running.is_empty() {
            let (lock, cvar) = &*notify_pair;
            let mut done = lock.lock().unwrap();
            if !*done {
                let _ = cvar.wait_timeout(
                    done,
                    std::time::Duration::from_millis(PARALLEL_POLL_INTERVAL_MS),
                );
            } else {
                *done = false;
            }
        } else if !launched_any && running.is_empty() && completed.len() < total_count {
            // Safety fallback: break to avoid infinite loop
            break;
        }
    }

    // Join remaining threads
    for (idx, resources, handle) in running {
        let _ = handle.join();
        completed.insert(idx);
        for res in &resources {
            held_resources.remove(res);
        }
    }

    // Final collection
    {
        let mut collected = results_collector.lock().unwrap();
        for (idx, result) in collected.drain(..) {
            if result.success {
                record_service_metrics(&enabled_queue[idx], result.duration_ms);
            }
            report.results.push(result);
        }
    }

    Ok(())
}

/// Cancel the current service run
#[tauri::command]
pub fn cancel_service_run() -> Result<(), String> {
    let mut state = SERVICE_STATE.lock().unwrap();
    if let Some(ref mut s) = *state {
        if s.is_running {
            s.is_running = false;
            if let Some(ref mut report) = s.current_report {
                report.status = ServiceRunStatus::Cancelled;
                report.completed_at = Some(Utc::now().to_rfc3339());
            }
            return Ok(());
        }
    }
    Err("No service run in progress".to_string())
}

/// Get a saved report by ID
#[tauri::command]
pub fn get_service_report(report_id: String) -> Result<ServiceReport, String> {
    let file_path = get_reports_dir().join(format!("{}.json", report_id));
    let json =
        fs::read_to_string(&file_path).map_err(|e| format!("Failed to read report: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse report: {}", e))
}

/// List all saved reports
#[tauri::command]
pub fn list_service_reports() -> Result<Vec<ServiceReport>, String> {
    let reports_dir = get_reports_dir();
    if !reports_dir.exists() {
        return Ok(Vec::new());
    }

    let mut reports = Vec::new();
    let entries =
        fs::read_dir(&reports_dir).map_err(|e| format!("Failed to read reports dir: {}", e))?;

    for entry in entries.flatten() {
        if entry.path().extension().is_some_and(|ext| ext == "json") {
            if let Ok(json) = fs::read_to_string(entry.path()) {
                if let Ok(report) = serde_json::from_str(&json) {
                    reports.push(report);
                }
            }
        }
    }

    // Sort by start time descending
    reports.sort_by(|a: &ServiceReport, b: &ServiceReport| b.started_at.cmp(&a.started_at));

    Ok(reports)
}

/// Delete a saved report by ID
#[tauri::command]
pub fn delete_report(report_id: String) -> Result<(), String> {
    let file_path = get_reports_dir().join(format!("{}.json", report_id));

    if !file_path.exists() {
        return Err(format!("Report not found: {}", report_id));
    }

    fs::remove_file(&file_path).map_err(|e| format!("Failed to delete report: {}", e))
}

/// Delete all saved reports
#[tauri::command]
pub fn clear_all_reports() -> Result<u32, String> {
    let reports_dir = get_reports_dir();
    if !reports_dir.exists() {
        return Ok(0);
    }

    let mut deleted_count = 0u32;
    let entries =
        fs::read_dir(&reports_dir).map_err(|e| format!("Failed to read reports dir: {}", e))?;

    for entry in entries.flatten() {
        if entry.path().extension().is_some_and(|ext| ext == "json")
            && fs::remove_file(entry.path()).is_ok() {
                deleted_count += 1;
            }
    }

    Ok(deleted_count)
}

// =============================================================================
// Pause / Resume Commands
// =============================================================================

/// Pause the current service run (takes effect between services)
#[tauri::command]
pub fn pause_service_run(app: AppHandle) -> Result<(), String> {
    let mut state = SERVICE_STATE.lock().unwrap();
    if let Some(ref mut s) = *state {
        if s.is_running && !s.is_paused {
            s.is_paused = true;
            if let Some(ref mut report) = s.current_report {
                report.status = ServiceRunStatus::Paused;
            }
            drop(state);
            let _ = app.emit("service-state-changed", get_service_run_state());
            return Ok(());
        }
    }
    Err("No active service run to pause".to_string())
}

/// Resume a paused service run
#[tauri::command]
pub fn resume_service_run(app: AppHandle) -> Result<(), String> {
    let mut state = SERVICE_STATE.lock().unwrap();
    if let Some(ref mut s) = *state {
        if s.is_running && s.is_paused {
            s.is_paused = false;
            if let Some(ref mut report) = s.current_report {
                report.status = ServiceRunStatus::Running;
            }
            PAUSE_CONDVAR.notify_all();
            drop(state);
            let _ = app.emit("service-state-changed", get_service_run_state());
            return Ok(());
        }
    }
    Err("No paused service run to resume".to_string())
}

// =============================================================================
// Report Editing Commands (for agent)
// =============================================================================

/// Load a report from disk (helper)
fn load_report(report_id: &str) -> Result<ServiceReport, String> {
    let file_path = get_reports_dir().join(format!("{}.json", report_id));
    let json =
        fs::read_to_string(&file_path).map_err(|e| format!("Failed to read report: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse report: {}", e))
}

/// Edit an existing finding in a report
#[tauri::command]
pub fn edit_report_finding(
    report_id: String,
    service_id: String,
    finding_index: usize,
    severity: Option<String>,
    title: Option<String>,
    description: Option<String>,
    recommendation: Option<String>,
) -> Result<(), String> {
    let mut report = load_report(&report_id)?;

    let result = report
        .results
        .iter_mut()
        .find(|r| r.service_id == service_id)
        .ok_or_else(|| format!("Service result not found: {}", service_id))?;

    let finding = result
        .findings
        .get_mut(finding_index)
        .ok_or_else(|| format!("Finding index out of range: {}", finding_index))?;

    if let Some(sev) = severity {
        finding.severity = match sev.as_str() {
            "info" => FindingSeverity::Info,
            "success" => FindingSeverity::Success,
            "warning" => FindingSeverity::Warning,
            "error" => FindingSeverity::Error,
            "critical" => FindingSeverity::Critical,
            _ => return Err(format!("Invalid severity: {}", sev)),
        };
    }
    if let Some(t) = title {
        finding.title = t;
    }
    if let Some(d) = description {
        finding.description = d;
    }
    if let Some(r) = recommendation {
        finding.recommendation = Some(r);
    }

    save_report(&report)
}

/// Add a new finding to a service result in a report
#[tauri::command]
pub fn add_report_finding(
    report_id: String,
    service_id: String,
    severity: String,
    title: String,
    description: String,
    recommendation: Option<String>,
) -> Result<(), String> {
    let mut report = load_report(&report_id)?;

    let result = report
        .results
        .iter_mut()
        .find(|r| r.service_id == service_id)
        .ok_or_else(|| format!("Service result not found: {}", service_id))?;

    let sev = match severity.as_str() {
        "info" => FindingSeverity::Info,
        "success" => FindingSeverity::Success,
        "warning" => FindingSeverity::Warning,
        "error" => FindingSeverity::Error,
        "critical" => FindingSeverity::Critical,
        _ => return Err(format!("Invalid severity: {}", severity)),
    };

    result.findings.push(ServiceFinding {
        severity: sev,
        title,
        description,
        recommendation,
        data: None,
    });

    save_report(&report)
}

/// Remove a finding from a service result in a report
#[tauri::command]
pub fn remove_report_finding(
    report_id: String,
    service_id: String,
    finding_index: usize,
) -> Result<(), String> {
    let mut report = load_report(&report_id)?;

    let result = report
        .results
        .iter_mut()
        .find(|r| r.service_id == service_id)
        .ok_or_else(|| format!("Service result not found: {}", service_id))?;

    if finding_index >= result.findings.len() {
        return Err(format!("Finding index out of range: {}", finding_index));
    }

    result.findings.remove(finding_index);
    save_report(&report)
}

/// Set agent-generated executive summary on a report
#[tauri::command]
pub fn set_report_summary(report_id: String, summary: String) -> Result<(), String> {
    let mut report = load_report(&report_id)?;
    report.agent_summary = Some(summary);
    save_report(&report)
}

/// Set agent-generated analysis for a specific service result
#[tauri::command]
pub fn set_service_analysis(
    report_id: String,
    service_id: String,
    analysis: String,
) -> Result<(), String> {
    let mut report = load_report(&report_id)?;

    let result = report
        .results
        .iter_mut()
        .find(|r| r.service_id == service_id)
        .ok_or_else(|| format!("Service result not found: {}", service_id))?;

    result.agent_analysis = Some(analysis);
    save_report(&report)
}

/// Set the health score on a report
#[tauri::command]
pub fn set_report_health_score(report_id: String, score: u8) -> Result<(), String> {
    if score > 100 {
        return Err("Health score must be 0-100".to_string());
    }
    let mut report = load_report(&report_id)?;
    report.health_score = Some(score);
    save_report(&report)
}

// =============================================================================
// Report Statistics
// =============================================================================

/// Compute statistics for a report
fn compute_report_statistics(report: &ServiceReport) -> ReportStatistics {
    let total_services = report.results.len();
    let passed = report.results.iter().filter(|r| r.success).count();
    let failed = total_services - passed;

    let total_duration_ms = report.results.iter().map(|r| r.duration_ms).sum::<u64>();
    let avg_duration_ms = if total_services > 0 {
        total_duration_ms / total_services as u64
    } else {
        0
    };

    let slowest_service = report
        .results
        .iter()
        .max_by_key(|r| r.duration_ms)
        .map(|r| (r.service_id.clone(), r.duration_ms));

    let fastest_service = report
        .results
        .iter()
        .min_by_key(|r| r.duration_ms)
        .map(|r| (r.service_id.clone(), r.duration_ms));

    let mut counts = FindingSeverityCounts {
        info: 0,
        success: 0,
        warning: 0,
        error: 0,
        critical: 0,
    };

    for result in &report.results {
        for finding in &result.findings {
            match finding.severity {
                FindingSeverity::Info => counts.info += 1,
                FindingSeverity::Success => counts.success += 1,
                FindingSeverity::Warning => counts.warning += 1,
                FindingSeverity::Error => counts.error += 1,
                FindingSeverity::Critical => counts.critical += 1,
            }
        }
    }

    let total_findings =
        counts.info + counts.success + counts.warning + counts.error + counts.critical;

    // Health score: start at base, penalize for issues, bonus for successes
    let raw_score: i32 = HEALTH_SCORE_BASE
        - (counts.critical as i32 * CRITICAL_FINDING_PENALTY)
        - (counts.error as i32 * ERROR_FINDING_PENALTY)
        - (counts.warning as i32 * WARNING_FINDING_PENALTY)
        + (counts.success as i32 * SUCCESS_FINDING_BONUS);
    let health_score = raw_score.clamp(0, HEALTH_SCORE_BASE) as u8;

    ReportStatistics {
        total_services,
        passed,
        failed,
        total_duration_ms,
        avg_duration_ms,
        slowest_service,
        fastest_service,
        findings_by_severity: counts,
        total_findings,
        health_score,
    }
}

/// Get computed statistics for a report
#[tauri::command]
pub fn get_report_statistics(report_id: String) -> Result<ReportStatistics, String> {
    let report = load_report(&report_id)?;
    Ok(compute_report_statistics(&report))
}

// =============================================================================
// PDF Report Generation
// =============================================================================

/// Format the PDF header section (report metadata).
fn format_pdf_header(report: &ServiceReport) -> Vec<String> {
    let mut lines = Vec::new();
    lines.push("═══════════════════════════════════════════════════════".to_string());
    lines.push("                   SERVICE REPORT                     ".to_string());
    lines.push("═══════════════════════════════════════════════════════".to_string());
    lines.push(String::new());
    lines.push(format!("Report ID:    {}", report.id));
    lines.push(format!("Date:         {}", report.started_at));
    if let Some(ref name) = report.technician_name {
        lines.push(format!("Technician:   {}", name));
    }
    if let Some(ref name) = report.customer_name {
        lines.push(format!("Customer:     {}", name));
    }
    lines.push(format!("Status:       {:?}", report.status));
    if let Some(score) = report.health_score {
        lines.push(format!("Health Score: {}/100", score));
    }
    lines.push(String::new());

    if let Some(ref summary) = report.agent_summary {
        lines.push("───────────────────────────────────────────────────────".to_string());
        lines.push("  AI ANALYSIS SUMMARY                                 ".to_string());
        lines.push("───────────────────────────────────────────────────────".to_string());
        lines.push(summary.clone());
        lines.push(String::new());
    }

    lines
}

/// Format the statistics section of the PDF.
fn format_pdf_summary(stats: &ReportStatistics) -> Vec<String> {
    let mut lines = Vec::new();
    lines.push("───────────────────────────────────────────────────────".to_string());
    lines.push("  STATISTICS                                          ".to_string());
    lines.push("───────────────────────────────────────────────────────".to_string());
    lines.push(format!("Services Run:     {}", stats.total_services));
    lines.push(format!("Passed:           {}", stats.passed));
    lines.push(format!("Failed:           {}", stats.failed));
    lines.push(format!(
        "Total Duration:   {:.1}s",
        stats.total_duration_ms as f64 / MS_PER_SECOND
    ));
    lines.push(format!(
        "Avg per Service:  {:.1}s",
        stats.avg_duration_ms as f64 / MS_PER_SECOND
    ));
    lines.push(String::new());
    lines.push(format!(
        "Findings:  {} critical, {} errors, {} warnings, {} info, {} success",
        stats.findings_by_severity.critical,
        stats.findings_by_severity.error,
        stats.findings_by_severity.warning,
        stats.findings_by_severity.info,
        stats.findings_by_severity.success
    ));
    lines.push(String::new());
    lines
}

/// Format the per-service findings section of the PDF.
fn format_pdf_findings(results: &[ServiceResult]) -> Vec<String> {
    let definitions = services::get_all_definitions();
    let def_map: HashMap<String, &crate::types::ServiceDefinition> =
        definitions.iter().map(|d| (d.id.clone(), d)).collect();

    let mut lines = Vec::new();

    for result in results {
        let service_name = def_map
            .get(&result.service_id)
            .map(|d| d.name.as_str())
            .unwrap_or(&result.service_id);

        lines.push("───────────────────────────────────────────────────────".to_string());
        lines.push(format!(
            "  {} — {}",
            service_name,
            if result.success { "PASSED" } else { "FAILED" }
        ));
        lines.push(format!(
            "  Duration: {:.1}s",
            result.duration_ms as f64 / MS_PER_SECOND
        ));
        lines.push("───────────────────────────────────────────────────────".to_string());

        if let Some(ref err) = result.error {
            lines.push(format!("  ERROR: {}", err));
        }

        for finding in &result.findings {
            let sev = match finding.severity {
                FindingSeverity::Info => "INFO",
                FindingSeverity::Success => "OK",
                FindingSeverity::Warning => "WARN",
                FindingSeverity::Error => "ERROR",
                FindingSeverity::Critical => "CRITICAL",
            };
            lines.push(format!("  [{}] {}", sev, finding.title));
            if !finding.description.is_empty() {
                lines.push(format!("         {}", finding.description));
            }
            if let Some(ref rec) = finding.recommendation {
                lines.push(format!("         → {}", rec));
            }
        }

        if let Some(ref analysis) = result.agent_analysis {
            lines.push(String::new());
            lines.push(format!("  AI Analysis: {}", analysis));
        }

        lines.push(String::new());
    }

    lines
}

/// Generate a PDF report and return the file path
#[tauri::command]
pub fn generate_report_pdf(
    report_id: String,
    output_path: Option<String>,
) -> Result<String, String> {
    let report = load_report(&report_id)?;
    let stats = compute_report_statistics(&report);

    let pdf_path = match output_path {
        Some(p) => std::path::PathBuf::from(p),
        None => get_reports_dir().join(format!("{}.pdf", report.id)),
    };

    let mut lines = format_pdf_header(&report);
    lines.extend(format_pdf_summary(&stats));
    lines.extend(format_pdf_findings(&report.results));

    // Footer
    lines.push("═══════════════════════════════════════════════════════".to_string());
    lines.push(format!(
        "Generated by RustService AI Agent — {}",
        Utc::now().to_rfc3339()
    ));
    lines.push("═══════════════════════════════════════════════════════".to_string());

    let content = lines.join("\n");

    if let Some(parent) = pdf_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
    }

    fs::write(&pdf_path, &content).map_err(|e| format!("Failed to write report: {}", e))?;

    Ok(pdf_path.to_string_lossy().to_string())
}
