//! Service runner commands
//!
//! Tauri commands for running diagnostic and maintenance services.
//! This module implements a modular service system with support for:
//! - Service definitions with configurable options
//! - Preset configurations (Diagnostics, General, Complete, Custom)
//! - Persistent run state across tab navigation
//! - Real-time log streaming via Tauri events

use std::collections::HashMap;
use std::fs;
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::data_dir::get_data_dir_path;
use crate::types::{
    FindingSeverity, PresetServiceConfig, ServiceDefinition, ServiceFinding, ServiceOptionSchema,
    ServicePreset, ServiceQueueItem, ServiceReport, ServiceResult, ServiceRunState,
    ServiceRunStatus,
};

// =============================================================================
// Global State for Persistent Service Runs
// =============================================================================

/// Global state for the currently running service
static SERVICE_STATE: Mutex<Option<ServiceRunState>> = Mutex::new(None);

// =============================================================================
// Service Definitions
// =============================================================================

/// Get all available service definitions
fn get_all_service_definitions() -> Vec<ServiceDefinition> {
    vec![
        // Ping Test Service
        ServiceDefinition {
            id: "ping-test".to_string(),
            name: "Ping Test".to_string(),
            description: "Tests network connectivity by pinging specified hosts".to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 10,
            required_programs: vec![], // Built-in Windows ping
            options: vec![
                ServiceOptionSchema {
                    id: "target".to_string(),
                    label: "Target Host".to_string(),
                    option_type: "string".to_string(),
                    default_value: json!("8.8.8.8"),
                    min: None,
                    max: None,
                    options: None,
                    description: Some("IP address or hostname to ping".to_string()),
                },
                ServiceOptionSchema {
                    id: "count".to_string(),
                    label: "Ping Count".to_string(),
                    option_type: "number".to_string(),
                    default_value: json!(4),
                    min: Some(1.0),
                    max: Some(100.0),
                    options: None,
                    description: Some("Number of ping requests to send".to_string()),
                },
            ],
            icon: "wifi".to_string(),
        },
        // Add more services here following the same pattern
    ]
}

/// Get service presets
fn get_all_presets() -> Vec<ServicePreset> {
    vec![
        ServicePreset {
            id: "diagnostics".to_string(),
            name: "Diagnostics".to_string(),
            description: "Quick diagnostic tests to identify system issues".to_string(),
            services: vec![PresetServiceConfig {
                service_id: "ping-test".to_string(),
                enabled: true,
                options: json!({"target": "8.8.8.8", "count": 4}),
            }],
            icon: "stethoscope".to_string(),
            color: "blue".to_string(),
        },
        ServicePreset {
            id: "general".to_string(),
            name: "General Service".to_string(),
            description: "Standard maintenance tasks for regular checkups".to_string(),
            services: vec![PresetServiceConfig {
                service_id: "ping-test".to_string(),
                enabled: true,
                options: json!({"target": "8.8.8.8", "count": 4}),
            }],
            icon: "wrench".to_string(),
            color: "green".to_string(),
        },
        ServicePreset {
            id: "complete".to_string(),
            name: "Complete Service".to_string(),
            description: "Comprehensive scan and cleanup for thorough maintenance".to_string(),
            services: vec![PresetServiceConfig {
                service_id: "ping-test".to_string(),
                enabled: true,
                options: json!({"target": "8.8.8.8", "count": 10}),
            }],
            icon: "shield-check".to_string(),
            color: "purple".to_string(),
        },
        ServicePreset {
            id: "custom".to_string(),
            name: "Custom Service".to_string(),
            description: "Build your own service configuration".to_string(),
            services: vec![PresetServiceConfig {
                service_id: "ping-test".to_string(),
                enabled: false,
                options: json!({}),
            }],
            icon: "settings-2".to_string(),
            color: "orange".to_string(),
        },
    ]
}

// =============================================================================
// Service Implementations
// =============================================================================

/// Run a single service and return its result
fn run_service(service_id: &str, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
    let start = Instant::now();
    let mut logs: Vec<String> = Vec::new();
    let mut findings: Vec<ServiceFinding> = Vec::new();
    let mut success = true;
    let mut error: Option<String> = None;

    // Emit log helper
    let emit_log = |log: &str, logs: &mut Vec<String>, app: &AppHandle| {
        logs.push(log.to_string());
        let _ = app.emit(
            "service-log",
            json!({
                "serviceId": service_id,
                "log": log,
                "timestamp": Utc::now().to_rfc3339()
            }),
        );
    };

    match service_id {
        "ping-test" => {
            let target = options
                .get("target")
                .and_then(|v| v.as_str())
                .unwrap_or("8.8.8.8");
            let count = options.get("count").and_then(|v| v.as_u64()).unwrap_or(4) as u32;

            emit_log(
                &format!("Starting ping test to {} ({} pings)", target, count),
                &mut logs,
                app,
            );

            // Run Windows ping command
            let output = Command::new("ping")
                .args(["-n", &count.to_string(), target])
                .output();

            match output {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);

                    // Log each line
                    for line in stdout.lines() {
                        if !line.trim().is_empty() {
                            emit_log(line, &mut logs, app);
                        }
                    }

                    if !stderr.is_empty() {
                        emit_log(&format!("Error: {}", stderr), &mut logs, app);
                    }

                    // Parse results
                    let mut avg_latency: Option<f64> = None;
                    let mut packet_loss: Option<u32> = None;

                    // Parse average latency from "Average = XXms"
                    if let Some(avg_line) = stdout.lines().find(|l| l.contains("Average")) {
                        if let Some(avg_str) = avg_line.split('=').last() {
                            let cleaned = avg_str.trim().replace("ms", "");
                            avg_latency = cleaned.parse().ok();
                        }
                    }

                    // Parse packet loss from "(X% loss)" or "Lost = X"
                    if let Some(loss_line) = stdout.lines().find(|l| l.contains("Lost")) {
                        if let Some(lost_part) = loss_line.split("Lost").nth(1) {
                            if let Some(num) = lost_part
                                .chars()
                                .filter(|c| c.is_ascii_digit())
                                .collect::<String>()
                                .parse::<u32>()
                                .ok()
                            {
                                packet_loss = Some((num * 100) / count);
                            }
                        }
                    }

                    // Generate findings
                    if output.status.success() {
                        if let Some(avg) = avg_latency {
                            let severity = if avg < 50.0 {
                                FindingSeverity::Success
                            } else if avg < 100.0 {
                                FindingSeverity::Info
                            } else if avg < 200.0 {
                                FindingSeverity::Warning
                            } else {
                                FindingSeverity::Error
                            };

                            findings.push(ServiceFinding {
                                severity,
                                title: format!("Average Latency: {:.0}ms", avg),
                                description: format!(
                                    "Ping to {} completed with average latency of {:.0}ms",
                                    target, avg
                                ),
                                recommendation: if avg > 100.0 {
                                    Some(
                                        "High latency detected. Check network connection."
                                            .to_string(),
                                    )
                                } else {
                                    None
                                },
                                data: Some(json!({"avgLatency": avg, "target": target})),
                            });
                        }

                        if let Some(loss) = packet_loss {
                            let severity = if loss == 0 {
                                FindingSeverity::Success
                            } else if loss < 10 {
                                FindingSeverity::Warning
                            } else {
                                FindingSeverity::Error
                            };

                            findings.push(ServiceFinding {
                                severity,
                                title: format!("Packet Loss: {}%", loss),
                                description: format!(
                                    "{} out of {} packets lost",
                                    (loss * count) / 100,
                                    count
                                ),
                                recommendation: if loss > 0 {
                                    Some(
                                        "Packet loss detected. Network may be unstable."
                                            .to_string(),
                                    )
                                } else {
                                    None
                                },
                                data: Some(json!({"packetLoss": loss})),
                            });
                        }

                        emit_log("Ping test completed successfully", &mut logs, app);
                    } else {
                        success = false;
                        error = Some("Ping command failed".to_string());
                        findings.push(ServiceFinding {
                            severity: FindingSeverity::Error,
                            title: "Ping Failed".to_string(),
                            description: format!("Unable to reach {}", target),
                            recommendation: Some(
                                "Check network connection and ensure host is reachable."
                                    .to_string(),
                            ),
                            data: None,
                        });
                    }
                }
                Err(e) => {
                    success = false;
                    error = Some(format!("Failed to execute ping command: {}", e));
                    emit_log(&format!("Error: {}", e), &mut logs, app);
                }
            }
        }
        _ => {
            success = false;
            error = Some(format!("Unknown service: {}", service_id));
        }
    }

    ServiceResult {
        service_id: service_id.to_string(),
        success,
        error,
        duration_ms: start.elapsed().as_millis() as u64,
        findings,
        logs,
    }
}

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
    get_all_service_definitions()
}

/// Get all service presets
#[tauri::command]
pub fn get_service_presets() -> Vec<ServicePreset> {
    get_all_presets()
}

/// Check if required programs are installed for given services
#[tauri::command]
pub fn validate_service_requirements(
    service_ids: Vec<String>,
) -> Result<HashMap<String, Vec<String>>, String> {
    let definitions = get_all_service_definitions();
    let def_map: HashMap<_, _> = definitions.iter().map(|d| (d.id.clone(), d)).collect();

    let mut missing: HashMap<String, Vec<String>> = HashMap::new();

    for service_id in service_ids {
        if let Some(def) = def_map.get(&service_id) {
            // TODO: Check against programs.json to see if programs are installed
            // For now, assume all built-in services have no external requirements
            if !def.required_programs.is_empty() {
                missing.insert(service_id, def.required_programs.clone());
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

        // Run the service
        let result = run_service(&queue_item.service_id, &queue_item.options, &app);
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
