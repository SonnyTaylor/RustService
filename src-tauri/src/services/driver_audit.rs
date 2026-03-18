//! Driver Audit Service
//!
//! Runs Windows `driverquery /v /fo csv` to inventory all installed drivers.
//! Flags stopped, degraded, or potentially problematic drivers.

use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::services::Service;
use crate::types::{
    FindingSeverity, ServiceDefinition, ServiceFinding, ServiceOptionSchema, ServiceResult,
};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct DriverAuditService;

impl Service for DriverAuditService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "driver-audit".to_string(),
            name: "Driver Audit".to_string(),
            description: "Inventory all installed drivers and flag stopped or problematic ones"
                .to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 15,
            required_programs: vec![], // Built-in Windows tool
            options: vec![ServiceOptionSchema {
                id: "show_all".to_string(),
                label: "Show All Drivers".to_string(),
                option_type: "boolean".to_string(),
                default_value: json!(false),
                min: None,
                max: None,
                options: None,
                description: Some("Show all drivers, not just problematic ones".to_string()),
            }],
            icon: "cpu".to_string(),
            exclusive_resources: vec![],
            dependencies: vec![],
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "driver-audit";

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

        let show_all = options
            .get("show_all")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        emit_log("Running driver inventory...", &mut logs, app);

        // Run driverquery with verbose CSV output
        let output = match Command::new("driverquery")
            .args(["/v", "/fo", "csv"])
            .output()
        {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to run driverquery: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Driver Query Failed".to_string(),
                    description: format!("Could not execute driverquery: {}", e),
                    recommendation: Some("Try running as administrator.".to_string()),
                    data: Some(json!({"type": "driver_audit", "error": true})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("driverquery execution failed: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                    agent_analysis: None,
                };
            }
        };

        // driverquery outputs in the system's encoding — try UTF-8 first, then lossy
        let stdout = String::from_utf8(output.stdout.clone())
            .unwrap_or_else(|_| String::from_utf8_lossy(&output.stdout).to_string());

        let exit_code = output.status.code().unwrap_or(-1);
        emit_log(
            &format!("driverquery exited with code: {}", exit_code),
            &mut logs,
            app,
        );

        // Parse CSV output
        let drivers = parse_driverquery_csv(&stdout);
        emit_log(
            &format!("Found {} installed drivers", drivers.len()),
            &mut logs,
            app,
        );

        // Categorize drivers
        let total = drivers.len();
        let running: Vec<&DriverInfo> = drivers.iter().filter(|d| d.state == "Running").collect();
        let stopped: Vec<&DriverInfo> = drivers.iter().filter(|d| d.state == "Stopped").collect();
        let problem: Vec<&DriverInfo> = drivers
            .iter()
            .filter(|d| d.status != "OK" || d.state == "Degraded" || d.state == "Unknown")
            .collect();

        emit_log(
            &format!(
                "Running: {}, Stopped: {}, Problem: {}",
                running.len(),
                stopped.len(),
                problem.len()
            ),
            &mut logs,
            app,
        );

        // Determine overall severity
        let (severity, title) = if !problem.is_empty() {
            (
                FindingSeverity::Warning,
                format!(
                    "{} problematic driver(s) found out of {}",
                    problem.len(),
                    total
                ),
            )
        } else {
            (
                FindingSeverity::Success,
                format!("All {} drivers are healthy", total),
            )
        };

        // Build driver data for renderer
        let driver_data: Vec<serde_json::Value> = if show_all {
            drivers.iter().map(|d| driver_to_json(d)).collect()
        } else {
            // Only include problematic + stopped (useful) drivers
            drivers
                .iter()
                .filter(|d| d.status != "OK" || d.state != "Running")
                .map(|d| driver_to_json(d))
                .collect()
        };

        findings.push(ServiceFinding {
            severity,
            title,
            description: format!(
                "{} total drivers: {} running, {} stopped, {} with issues.",
                total,
                running.len(),
                stopped.len(),
                problem.len()
            ),
            recommendation: if !problem.is_empty() {
                Some("Review problematic drivers and update or reinstall as needed.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "driver_audit",
                "totalDrivers": total,
                "runningDrivers": running.len(),
                "stoppedDrivers": stopped.len(),
                "problemDrivers": problem.len(),
                "drivers": driver_data,
                "showAll": show_all,
            })),
        });

        // Individual findings for problem drivers
        for driver in &problem {
            findings.push(ServiceFinding {
                severity: FindingSeverity::Warning,
                title: format!("Driver Issue: {}", driver.display_name),
                description: format!(
                    "Module: {} | State: {} | Status: {} | Type: {}",
                    driver.module_name, driver.state, driver.status, driver.driver_type
                ),
                recommendation: Some(
                    "Check Device Manager for this driver and update if available.".to_string(),
                ),
                data: None,
            });
        }

        // Clean up temp file
        emit_log("Driver audit complete.", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            findings,
            logs,
            agent_analysis: None,
        }
    }
}

// =============================================================================
// CSV Parser
// =============================================================================

struct DriverInfo {
    module_name: String,
    display_name: String,
    driver_type: String,
    start_mode: String,
    state: String,
    status: String,
    link_date: String,
    path: String,
}

fn driver_to_json(d: &DriverInfo) -> serde_json::Value {
    json!({
        "moduleName": d.module_name,
        "displayName": d.display_name,
        "driverType": d.driver_type,
        "startMode": d.start_mode,
        "state": d.state,
        "status": d.status,
        "linkDate": d.link_date,
        "path": d.path,
    })
}

fn parse_driverquery_csv(csv_text: &str) -> Vec<DriverInfo> {
    let mut drivers = Vec::new();
    let lines: Vec<&str> = csv_text.lines().collect();

    if lines.is_empty() {
        return drivers;
    }

    // Parse header to find column indices
    let header = parse_csv_line(lines[0]);
    let idx_module = find_column(&header, &["Module Name", "module name"]);
    let idx_display = find_column(&header, &["Display Name", "display name"]);
    let idx_type = find_column(&header, &["Driver Type", "driver type"]);
    let idx_start = find_column(&header, &["Start Mode", "start mode"]);
    let idx_state = find_column(&header, &["State", "state"]);
    let idx_status = find_column(&header, &["Status", "status"]);
    let idx_link_date = find_column(&header, &["Link Date", "link date"]);
    let idx_path = find_column(&header, &["Path", "path"]);

    for line in &lines[1..] {
        if line.trim().is_empty() {
            continue;
        }
        let cols = parse_csv_line(line);
        if cols.len() < 3 {
            continue;
        }

        let driver = DriverInfo {
            module_name: get_col(&cols, idx_module),
            display_name: get_col(&cols, idx_display),
            driver_type: get_col(&cols, idx_type),
            start_mode: get_col(&cols, idx_start),
            state: get_col(&cols, idx_state),
            status: get_col(&cols, idx_status),
            link_date: get_col(&cols, idx_link_date),
            path: get_col(&cols, idx_path),
        };

        drivers.push(driver);
    }

    drivers
}

fn find_column(header: &[String], names: &[&str]) -> Option<usize> {
    for name in names {
        if let Some(idx) = header.iter().position(|h| h.eq_ignore_ascii_case(name)) {
            return Some(idx);
        }
    }
    None
}

fn get_col(cols: &[String], idx: Option<usize>) -> String {
    idx.and_then(|i| cols.get(i))
        .map(|s| s.to_string())
        .unwrap_or_default()
}

/// Simple CSV line parser that handles quoted fields
fn parse_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in line.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => {
                fields.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    fields.push(current.trim().to_string());
    fields
}
