//! Service runner commands
//!
//! Tauri commands for running diagnostic and maintenance services.
//! This module delegates to the modular service system in `crate::services`.

use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::data_dir::get_data_dir_path;
use super::required_programs::validate_required_programs;
use crate::services;
use crate::types::{
    ServiceDefinition, ServicePreset, ServiceQueueItem, ServiceReport, ServiceRunState,
    ServiceRunStatus,
};

// =============================================================================
// Global State for Persistent Service Runs
// =============================================================================

/// Global state for the currently running service
static SERVICE_STATE: Mutex<Option<ServiceRunState>> = Mutex::new(None);

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

/// Get all service presets
#[tauri::command]
pub fn get_service_presets() -> Vec<ServicePreset> {
    services::get_all_presets()
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
) -> Result<ServiceReport, String> {
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
        technician_name,
        customer_name,
    };

    // Update global state
    {
        let mut state = SERVICE_STATE.lock().unwrap();
        *state = Some(ServiceRunState {
            is_running: true,
            current_report: Some(report.clone()),
        });
    }

    // Emit initial state
    let _ = app.emit("service-state-changed", get_service_run_state());

    let start_time = Instant::now();

    // Run each service
    for (index, queue_item) in enabled_queue.iter().enumerate() {
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
        let result = services::run_service(&queue_item.service_id, &queue_item.options, &app)
            .ok_or_else(|| format!("Unknown service: {}", queue_item.service_id))?;

        // Record timing for service metrics (only for successful runs)
        if result.success {
            // Compute options hash for settings-aware tracking
            let options_hash = Some(super::time_tracking::compute_options_hash(
                &queue_item.options,
            ));

            if let Err(e) = super::time_tracking::record_service_time(
                queue_item.service_id.clone(),
                result.duration_ms,
                None, // preset_id could be passed from frontend if needed
                options_hash,
            ) {
                eprintln!("Failed to record service time: {}", e);
            }
        }

        report.results.push(result);

        // Update state with latest results
        {
            let mut state = SERVICE_STATE.lock().unwrap();
            if let Some(ref mut s) = *state {
                if let Some(ref mut r) = s.current_report {
                    r.results = report.results.clone();
                }
            }
        }
    }

    // Complete report
    report.completed_at = Some(Utc::now().to_rfc3339());
    report.status = if report.results.iter().all(|r| r.success) {
        ServiceRunStatus::Completed
    } else {
        ServiceRunStatus::Failed
    };
    report.total_duration_ms = Some(start_time.elapsed().as_millis() as u64);
    report.current_service_index = None;

    // Save report
    if let Err(e) = save_report(&report) {
        eprintln!("Failed to save report: {}", e);
    }

    // Update global state
    {
        let mut state = SERVICE_STATE.lock().unwrap();
        *state = Some(ServiceRunState {
            is_running: false,
            current_report: Some(report.clone()),
        });
    }

    // Emit completion
    let _ = app.emit("service-state-changed", get_service_run_state());
    let _ = app.emit("service-completed", &report);

    Ok(report)
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
