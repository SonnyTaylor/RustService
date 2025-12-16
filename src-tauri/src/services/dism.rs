//! DISM Health Check Service
//!
//! Runs Windows built-in DISM.exe to check and repair the component store.
//! Supports CheckHealth, ScanHealth, and RestoreHealth operations.

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

pub struct DismService;

impl Service for DismService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "dism".to_string(),
            name: "Component Store Health".to_string(),
            description: "Check and repair Windows component store using DISM".to_string(),
            category: "maintenance".to_string(),
            estimated_duration_secs: 300,
            required_programs: vec![], // Built-in Windows tool
            options: vec![ServiceOptionSchema {
                id: "scan_only".to_string(),
                label: "Scan Only (no repair)".to_string(),
                option_type: "boolean".to_string(),
                default_value: json!(false),
                min: None,
                max: None,
                options: None,
                description: Some(
                    "Only scan for issues, don't attempt repairs (faster)".to_string(),
                ),
            }],
            icon: "package-check".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "dism";

        // Parse options
        let scan_only = options
            .get("scan_only")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

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

        emit_log(
            "Starting DISM component store health check...",
            &mut logs,
            app,
        );

        // Determine which actions to run
        let actions: Vec<&str> = if scan_only {
            vec!["CheckHealth", "ScanHealth"]
        } else {
            vec!["CheckHealth", "ScanHealth", "RestoreHealth"]
        };

        let mut overall_success = true;
        let mut corruption_detected = false;
        let mut corruption_repaired = false;
        let mut step_results: Vec<serde_json::Value> = Vec::new();

        for action in &actions {
            let action_flag = format!("/{}", action);

            emit_log(&format!("Running DISM {}...", action), &mut logs, app);

            let output = match Command::new("dism")
                .args(["/Online", "/Cleanup-Image", &action_flag])
                .output()
            {
                Ok(output) => output,
                Err(e) => {
                    emit_log(&format!("ERROR: Failed to run DISM: {}", e), &mut logs, app);
                    findings.push(ServiceFinding {
                        severity: FindingSeverity::Error,
                        title: "DISM Execution Failed".to_string(),
                        description: format!("Could not execute DISM: {}", e),
                        recommendation: Some(
                            "Ensure you are running with administrator privileges.".to_string(),
                        ),
                        data: Some(json!({"type": "error", "reason": "execution_failed"})),
                    });
                    return ServiceResult {
                        service_id: service_id.to_string(),
                        success: false,
                        error: Some(format!("DISM execution failed: {}", e)),
                        duration_ms: start.elapsed().as_millis() as u64,
                        findings,
                        logs,
                    };
                }
            };

            // DISM can output UTF-16LE, try to decode
            let stdout = decode_output(&output.stdout);
            let stderr = decode_output(&output.stderr);
            let exit_code = output.status.code().unwrap_or(-1);

            emit_log(
                &format!("DISM {} completed with exit code: {}", action, exit_code),
                &mut logs,
                app,
            );

            // Parse the output
            let parsed = parse_dism_output(&stdout);

            if parsed.corruption_detected {
                corruption_detected = true;
            }
            if parsed.health_state.as_deref() == Some("repaired") {
                corruption_repaired = true;
            }
            if parsed.access_denied {
                emit_log(
                    "ERROR: Access denied - requires administrator",
                    &mut logs,
                    app,
                );
                overall_success = false;
            }
            if exit_code != 0 && !parsed.operation_complete {
                overall_success = false;
            }

            step_results.push(json!({
                "action": action,
                "exit_code": exit_code,
                "health_state": parsed.health_state,
                "corruption_detected": parsed.corruption_detected,
                "repair_attempted": parsed.repair_attempted,
                "repair_success": parsed.repair_success,
                "access_denied": parsed.access_denied,
            }));

            // Log key findings from this step
            if let Some(ref state) = parsed.health_state {
                emit_log(&format!("Health state: {}", state), &mut logs, app);
            }

            // If we found corruption and we're in scan-only mode, we can stop
            if corruption_detected && scan_only && *action == "ScanHealth" {
                emit_log(
                    "Corruption detected. Run without 'Scan Only' to attempt repair.",
                    &mut logs,
                    app,
                );
                break;
            }

            // Log any stderr
            if !stderr.is_empty() && exit_code != 0 {
                emit_log(&format!("DISM stderr: {}", stderr.trim()), &mut logs, app);
            }
        }

        // Determine final status and finding
        let (severity, title, description) = if !overall_success {
            if step_results
                .iter()
                .any(|s| s["access_denied"].as_bool().unwrap_or(false))
            {
                (
                    FindingSeverity::Error,
                    "Access Denied".to_string(),
                    "DISM requires administrator privileges to run.".to_string(),
                )
            } else {
                (
                    FindingSeverity::Error,
                    "DISM Failed".to_string(),
                    "One or more DISM operations failed. Check logs for details.".to_string(),
                )
            }
        } else if corruption_repaired {
            (
                FindingSeverity::Success,
                "Component Store Repaired".to_string(),
                "Corruption was detected and successfully repaired.".to_string(),
            )
        } else if corruption_detected && !corruption_repaired {
            (
                FindingSeverity::Warning,
                "Corruption Detected".to_string(),
                if scan_only {
                    "Component store corruption detected. Run with repair enabled to fix."
                        .to_string()
                } else {
                    "Corruption detected but could not be fully repaired.".to_string()
                },
            )
        } else {
            (
                FindingSeverity::Success,
                "Component Store Healthy".to_string(),
                "No corruption detected. Windows component store is healthy.".to_string(),
            )
        };

        findings.push(ServiceFinding {
            severity,
            title,
            description,
            recommendation: if corruption_detected && !corruption_repaired {
                Some(if scan_only {
                    "Run DISM with RestoreHealth to attempt repairs.".to_string()
                } else {
                    "Try running 'DISM /Online /Cleanup-Image /RestoreHealth /Source:WIM' with a Windows installation media.".to_string()
                })
            } else {
                None
            },
            data: Some(json!({
                "type": "dism_result",
                "scan_only": scan_only,
                "corruption_detected": corruption_detected,
                "corruption_repaired": corruption_repaired,
                "steps": step_results,
            })),
        });

        emit_log("DISM health check complete", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: overall_success,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            findings,
            logs,
        }
    }
}

// =============================================================================
// Output Parsing
// =============================================================================

#[derive(Debug, Default)]
struct DismResult {
    health_state: Option<String>,
    repair_attempted: bool,
    repair_success: Option<bool>,
    access_denied: bool,
    operation_complete: bool,
    corruption_detected: bool,
}

fn decode_output(bytes: &[u8]) -> String {
    // DISM often outputs UTF-16LE on Windows
    if bytes.is_empty() {
        return String::new();
    }

    // Check for null bytes (indicator of UTF-16)
    if bytes.contains(&0) {
        // Try UTF-16LE
        let u16_iter = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]));
        if let Ok(decoded) = String::from_utf16(&u16_iter.collect::<Vec<_>>()) {
            return decoded.trim_start_matches('\u{feff}').to_string();
        }
    }

    // Fallback to UTF-8
    String::from_utf8_lossy(bytes).to_string()
}

fn parse_dism_output(output: &str) -> DismResult {
    let mut result = DismResult::default();

    for line in output.lines() {
        let lower = line.to_lowercase();

        // Check for completion
        if lower.contains("operation completed successfully")
            || lower.contains("the operation completed successfully")
        {
            result.operation_complete = true;
        }

        // Check for access denied
        if (lower.contains("access") && lower.contains("denied")) || lower.contains("error: 5") {
            result.access_denied = true;
        }

        // Health state detection
        if lower.contains("component store corruption repaired")
            || lower.contains("corruption was repaired")
        {
            result.health_state = Some("repaired".to_string());
            result.repair_attempted = true;
            result.repair_success = Some(true);
            result.corruption_detected = true;
        } else if lower.contains("component store is repairable") {
            result.health_state = Some("repairable".to_string());
            result.corruption_detected = true;
        } else if lower.contains("no component store corruption detected") {
            result.health_state = Some("healthy".to_string());
        } else if lower.contains("component store corruption") && lower.contains("detected") {
            result.corruption_detected = true;
            if result.health_state.is_none() {
                result.health_state = Some("corrupted".to_string());
            }
        }

        // Check for restore operation
        if lower.contains("restorehealth") || lower.contains("restore-health") {
            result.repair_attempted = true;
        }
    }

    result
}
