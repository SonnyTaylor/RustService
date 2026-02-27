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
use crate::services;
use crate::types::{
    FindingSeverity, FindingSeverityCounts, ReportStatistics, ServiceDefinition, ServiceFinding,
    ServicePreset, ServiceQueueItem, ServiceReport, ServiceResult, ServiceRunState,
    ServiceRunStatus,
};

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
    for (index, queue_item) in enabled_queue.iter().enumerate() {
        // Check if cancelled before starting next service
        {
            let state = SERVICE_STATE.lock().unwrap();
            if let Some(ref s) = *state {
                if !s.is_running {
                    break;
                }
            }
        }

        // Wait while paused (agent intervention)
        {
            let mut state = SERVICE_STATE.lock().unwrap();
            while state
                .as_ref()
                .map_or(false, |s| s.is_paused && s.is_running)
            {
                state = PAUSE_CONDVAR.wait(state).unwrap();
            }
            // Re-check cancellation after resuming from pause
            if let Some(ref s) = *state {
                if !s.is_running {
                    break;
                }
            }
        }

        // Update current index
        {
            let mut state = SERVICE_STATE.lock().unwrap();
            if let Some(ref mut s) = *state {
                if let Some(ref mut r) = s.current_report {
                    r.current_service_index = Some(index);
                }
            }
        }

        // Emit progress
        let _ = app.emit(
            "service-progress",
            json!({
                "currentIndex": index,
                "totalCount": enabled_queue.len(),
                "serviceId": queue_item.service_id
            }),
        );

        // Run the service using the modular service system
        let result = services::run_service(&queue_item.service_id, &queue_item.options, app)
            .ok_or_else(|| format!("Unknown service: {}", queue_item.service_id))?;

        // Record timing for service metrics (only for successful runs)
        if result.success {
            let options_hash = Some(super::time_tracking::compute_options_hash(
                &queue_item.options,
            ));

            if let Err(e) = super::time_tracking::record_service_time(
                queue_item.service_id.clone(),
                result.duration_ms,
                None,
                options_hash,
            ) {
                eprintln!("Failed to record service time: {}", e);
            }
        }

        report.results.push(result);

        // Update state with latest results and emit to frontend
        {
            let mut state = SERVICE_STATE.lock().unwrap();
            if let Some(ref mut s) = *state {
                if let Some(ref mut r) = s.current_report {
                    r.results = report.results.clone();
                }
            }
        }
        let _ = app.emit("service-state-changed", get_service_run_state());
    }

    Ok(())
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
    // Build a map of service_id -> exclusive_resources from definitions
    let all_defs = services::get_all_definitions();
    let resource_map: HashMap<String, Vec<String>> = all_defs
        .into_iter()
        .map(|d| (d.id.clone(), d.exclusive_resources))
        .collect();

    // Track state for the scheduler
    let total_count = enabled_queue.len();
    let results_collector: Arc<Mutex<Vec<(usize, ServiceResult)>>> =
        Arc::new(Mutex::new(Vec::new()));

    // Track which indices have been started and completed
    let mut started: HashSet<usize> = HashSet::new();
    let mut completed: HashSet<usize> = HashSet::new();
    // Resources currently held by running services
    let mut held_resources: HashSet<String> = HashSet::new();
    // Map of currently running thread join handles with their index and resources
    let mut running: Vec<(usize, Vec<String>, std::thread::JoinHandle<()>)> = Vec::new();

    // Notification channel for when a task completes
    let notify_pair = Arc::new((Mutex::new(false), Condvar::new()));

    loop {
        // Check cancellation
        {
            let state = SERVICE_STATE.lock().unwrap();
            if let Some(ref s) = *state {
                if !s.is_running {
                    break;
                }
            }
        }

        // If everything has been started and completed, we're done
        if completed.len() == total_count {
            break;
        }

        // Collect completed threads
        let mut newly_completed = Vec::new();
        running.retain(|(idx, resources, handle)| {
            if handle.is_finished() {
                newly_completed.push((*idx, resources.clone()));
                false
            } else {
                true
            }
        });

        // Release resources from completed tasks and join them
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
                // Record timing for service metrics
                if result.success {
                    let queue_item = &enabled_queue[idx];
                    let options_hash = Some(super::time_tracking::compute_options_hash(
                        &queue_item.options,
                    ));

                    if let Err(e) = super::time_tracking::record_service_time(
                        queue_item.service_id.clone(),
                        result.duration_ms,
                        None,
                        options_hash,
                    ) {
                        eprintln!("Failed to record service time: {}", e);
                    }
                }

                report.results.push(result);
            }
        }

        // Update state if anything changed
        if !newly_completed.is_empty() {
            let active_indices: Vec<usize> = running.iter().map(|(idx, _, _)| *idx).collect();
            {
                let mut state = SERVICE_STATE.lock().unwrap();
                if let Some(ref mut s) = *state {
                    if let Some(ref mut r) = s.current_report {
                        r.results = report.results.clone();
                        r.current_service_indices = active_indices.clone();
                        r.current_service_index = active_indices.first().copied();
                    }
                }
            }
            let _ = app.emit("service-state-changed", get_service_run_state());
        }

        // Try to start new services that don't conflict with running ones
        let mut launched_any = false;
        for (index, queue_item) in enabled_queue.iter().enumerate() {
            if started.contains(&index) {
                continue;
            }

            // Check cancellation again
            {
                let state = SERVICE_STATE.lock().unwrap();
                if let Some(ref s) = *state {
                    if !s.is_running {
                        break;
                    }
                }
            }

            // Get this service's exclusive resources
            let service_resources = resource_map
                .get(&queue_item.service_id)
                .cloned()
                .unwrap_or_default();

            // Check if any of its resources conflict with currently held ones
            let has_conflict = service_resources.iter().any(|r| held_resources.contains(r));

            if has_conflict {
                continue; // Skip this service for now; it'll be picked up later
            }

            // Mark resources as held
            for res in &service_resources {
                held_resources.insert(res.clone());
            }
            started.insert(index);
            launched_any = true;

            // Emit progress for this service starting
            let _ = app.emit(
                "service-progress",
                json!({
                    "currentIndex": index,
                    "totalCount": total_count,
                    "serviceId": queue_item.service_id
                }),
            );

            // Update active indices in state
            let active_indices: Vec<usize> = running
                .iter()
                .map(|(idx, _, _)| *idx)
                .chain(std::iter::once(index))
                .collect();
            {
                let mut state = SERVICE_STATE.lock().unwrap();
                if let Some(ref mut s) = *state {
                    if let Some(ref mut r) = s.current_report {
                        r.current_service_indices = active_indices.clone();
                        r.current_service_index = active_indices.first().copied();
                    }
                }
            }
            let _ = app.emit("service-state-changed", get_service_run_state());

            // Spawn thread to run this service
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

                // Push result to collector
                {
                    let mut collected = results_tx.lock().unwrap();
                    collected.push((index, result));
                }

                // Notify the scheduler that a task completed
                let (lock, cvar) = &*notify;
                let mut done = lock.lock().unwrap();
                *done = true;
                cvar.notify_one();
            });

            running.push((index, service_resources, handle));
        }

        // If we launched nothing and there are still running tasks, wait for one to complete
        if !launched_any && !running.is_empty() {
            let (lock, cvar) = &*notify_pair;
            let mut done = lock.lock().unwrap();
            // Wait with a short timeout to periodically check cancellation
            if !*done {
                let _ = cvar.wait_timeout(done, std::time::Duration::from_millis(250));
            } else {
                *done = false;
            }
        } else if !launched_any && running.is_empty() && completed.len() < total_count {
            // All remaining services conflict with each other but none are running
            // This shouldn't happen, but handle it gracefully — start the next unstarted one
            for (index, _queue_item) in enabled_queue.iter().enumerate() {
                if !started.contains(&index) {
                    // Force-start it sequentially by not checking resources
                    // This is a safety fallback
                    break;
                }
            }
            // If we get here with nothing to do, break to avoid infinite loop
            if started.len() + completed.len() >= total_count || running.is_empty() {
                break;
            }
        }
    }

    // Wait for any remaining running threads
    for (idx, resources, handle) in running {
        let _ = handle.join();
        completed.insert(idx);
        for res in &resources {
            held_resources.remove(res);
        }
    }

    // Final collection of results
    {
        let mut collected = results_collector.lock().unwrap();
        for (idx, result) in collected.drain(..) {
            if result.success {
                let queue_item = &enabled_queue[idx];
                let options_hash = Some(super::time_tracking::compute_options_hash(
                    &queue_item.options,
                ));
                if let Err(e) = super::time_tracking::record_service_time(
                    queue_item.service_id.clone(),
                    result.duration_ms,
                    None,
                    options_hash,
                ) {
                    eprintln!("Failed to record service time: {}", e);
                }
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
        if entry.path().extension().map_or(false, |ext| ext == "json") {
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
        if entry.path().extension().map_or(false, |ext| ext == "json") {
            if fs::remove_file(entry.path()).is_ok() {
                deleted_count += 1;
            }
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

    // Health score: start at 100, penalize for issues
    let raw_score: i32 = 100
        - (counts.critical as i32 * 30)
        - (counts.error as i32 * 15)
        - (counts.warning as i32 * 5)
        + (counts.success as i32 * 2);
    let health_score = raw_score.clamp(0, 100) as u8;

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

/// Generate a PDF report and return the file path
#[tauri::command]
pub fn generate_report_pdf(
    report_id: String,
    output_path: Option<String>,
) -> Result<String, String> {
    let report = load_report(&report_id)?;
    let stats = compute_report_statistics(&report);

    // Determine output path
    let pdf_path = match output_path {
        Some(p) => std::path::PathBuf::from(p),
        None => get_reports_dir().join(format!("{}.pdf", report.id)),
    };

    // Build PDF content as formatted text
    let mut lines: Vec<String> = Vec::new();

    // Header
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

    // Statistics
    lines.push("───────────────────────────────────────────────────────".to_string());
    lines.push("  STATISTICS                                          ".to_string());
    lines.push("───────────────────────────────────────────────────────".to_string());
    lines.push(format!("Services Run:     {}", stats.total_services));
    lines.push(format!("Passed:           {}", stats.passed));
    lines.push(format!("Failed:           {}", stats.failed));
    lines.push(format!(
        "Total Duration:   {:.1}s",
        stats.total_duration_ms as f64 / 1000.0
    ));
    lines.push(format!(
        "Avg per Service:  {:.1}s",
        stats.avg_duration_ms as f64 / 1000.0
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

    // Agent Summary
    if let Some(ref summary) = report.agent_summary {
        lines.push("───────────────────────────────────────────────────────".to_string());
        lines.push("  AI ANALYSIS SUMMARY                                 ".to_string());
        lines.push("───────────────────────────────────────────────────────".to_string());
        lines.push(summary.clone());
        lines.push(String::new());
    }

    // Per-service results
    let definitions = services::get_all_definitions();
    let def_map: HashMap<String, &crate::types::ServiceDefinition> =
        definitions.iter().map(|d| (d.id.clone(), d)).collect();

    for result in &report.results {
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
            result.duration_ms as f64 / 1000.0
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

    // Footer
    lines.push("═══════════════════════════════════════════════════════".to_string());
    lines.push(format!(
        "Generated by RustService AI Agent — {}",
        Utc::now().to_rfc3339()
    ));
    lines.push("═══════════════════════════════════════════════════════".to_string());

    let content = lines.join("\n");

    // Ensure parent directory exists
    if let Some(parent) = pdf_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
    }

    // Write as a text-based report file (portable across all systems)
    fs::write(&pdf_path, &content).map_err(|e| format!("Failed to write report: {}", e))?;

    Ok(pdf_path.to_string_lossy().to_string())
}
