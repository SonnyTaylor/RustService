//! KVRT Scan Service
//!
//! Executes Kaspersky Virus Removal Tool (KVRT) with silent mode options,
//! captures console output, and parses detection results.

use std::path::Path;
use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use regex::Regex;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::commands::get_program_exe_path;
use crate::services::Service;
use crate::types::{FindingSeverity, ServiceDefinition, ServiceFinding, ServiceResult};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct KvrtScanService;

impl Service for KvrtScanService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "kvrt-scan".to_string(),
            name: "Virus Scan (KVRT)".to_string(),
            description: "Scans for viruses and malware using Kaspersky Virus Removal Tool"
                .to_string(),
            category: "security".to_string(),
            estimated_duration_secs: 300,
            required_programs: vec!["kvrt".to_string()],
            options: vec![],
            icon: "shield-alert".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "kvrt-scan";

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

        emit_log("Starting KVRT antivirus scan...", &mut logs, app);

        // Get KVRT executable path
        let exe_path = match get_program_exe_path("kvrt".to_string()) {
            Ok(Some(path)) => path,
            Ok(None) => {
                emit_log("ERROR: KVRT.exe not found", &mut logs, app);
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "KVRT Not Found".to_string(),
                    description: "Kaspersky Virus Removal Tool executable was not found."
                        .to_string(),
                    recommendation: Some(
                        "Download KVRT from Kaspersky's website and place it in the programs folder."
                            .to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "exe_not_found"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("KVRT.exe not found".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to locate KVRT: {}", e),
                    &mut logs,
                    app,
                );
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(e.to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
        };

        emit_log(&format!("Found KVRT at: {}", exe_path), &mut logs, app);

        // Build command arguments
        let args = vec![
            "-accepteula",
            "-silent",
            "-details",
            "-noads",
            "-fixednames",
        ];

        emit_log(
            "Running scan (this may take several minutes)...",
            &mut logs,
            app,
        );

        // Get working directory
        let working_dir = Path::new(&exe_path)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

        // Execute KVRT
        let output = match Command::new(&exe_path)
            .args(&args)
            .current_dir(&working_dir)
            .output()
        {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to execute KVRT: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Execution Failed".to_string(),
                    description: format!("Failed to run KVRT: {}", e),
                    recommendation: Some(
                        "Ensure KVRT.exe is accessible and not corrupted.".to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "execution_failed"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("Execution failed: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        emit_log(
            &format!("KVRT completed with exit code: {}", exit_code),
            &mut logs,
            app,
        );

        // Parse output
        let parsed = parse_kvrt_output(&stdout);

        // Log summary
        if let Some(processed) = parsed.processed {
            emit_log(&format!("Objects processed: {}", processed), &mut logs, app);
        }
        if let Some(detected) = parsed.detected {
            emit_log(&format!("Threats detected: {}", detected), &mut logs, app);
        }
        emit_log(
            &format!("Threats removed/neutralized: {}", parsed.removed_count),
            &mut logs,
            app,
        );

        // Determine overall severity
        let (severity, status) = if parsed.detected.unwrap_or(0) > 0 {
            if parsed.removed_count >= parsed.detected.unwrap_or(0) as usize {
                (FindingSeverity::Warning, "Threats Neutralized")
            } else {
                (FindingSeverity::Error, "Threats Detected")
            }
        } else {
            (FindingSeverity::Success, "No Threats Found")
        };

        // Create summary finding
        findings.push(ServiceFinding {
            severity: severity.clone(),
            title: status.to_string(),
            description: format!(
                "Scanned {} objects. {} threat(s) detected, {} neutralized.",
                parsed.processed.unwrap_or(0),
                parsed.detected.unwrap_or(0),
                parsed.removed_count
            ),
            recommendation: if parsed.detected.unwrap_or(0) > 0
                && parsed.removed_count < parsed.detected.unwrap_or(0) as usize
            {
                Some(
                    "Some threats could not be automatically removed. Consider manual review."
                        .to_string(),
                )
            } else {
                None
            },
            data: Some(json!({
                "type": "kvrt_summary",
                "processed": parsed.processed,
                "processingErrors": parsed.processing_errors,
                "detected": parsed.detected,
                "passwordProtected": parsed.password_protected,
                "corrupted": parsed.corrupted,
                "removedCount": parsed.removed_count,
                "detections": parsed.detections,
                "exitCode": exit_code,
            })),
        });

        // Add individual detection findings
        for detection in &parsed.detections {
            let action = detection.action.as_deref().unwrap_or("None");
            let det_severity = if action.to_lowercase().contains("delete")
                || action.to_lowercase().contains("quarantine")
                || action.to_lowercase().contains("disinfect")
            {
                FindingSeverity::Warning
            } else {
                FindingSeverity::Error
            };

            findings.push(ServiceFinding {
                severity: det_severity,
                title: detection.threat.clone(),
                description: format!("Found in: {}", detection.object_path),
                recommendation: Some(format!("Action taken: {}", action)),
                data: Some(json!({
                    "type": "kvrt_detection",
                    "threat": detection.threat,
                    "objectPath": detection.object_path,
                    "action": detection.action,
                })),
            });
        }

        if !stderr.is_empty() && stderr.len() < 500 {
            emit_log(&format!("KVRT stderr: {}", stderr.trim()), &mut logs, app);
        }

        emit_log("KVRT scan complete", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: exit_code == 0 || parsed.detected.unwrap_or(0) == 0,
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
struct KvrtParsedOutput {
    processed: Option<u32>,
    processing_errors: Option<u32>,
    detected: Option<u32>,
    password_protected: Option<u32>,
    corrupted: Option<u32>,
    detections: Vec<KvrtDetection>,
    removed_count: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
struct KvrtDetection {
    threat: String,
    object_path: String,
    action: Option<String>,
}

fn parse_kvrt_output(output: &str) -> KvrtParsedOutput {
    let mut result = KvrtParsedOutput::default();

    // Regex patterns for counts
    let re_processed = Regex::new(r"(?i)^\s*Processed:\s*(\d+)").ok();
    let re_errors = Regex::new(r"(?i)^\s*Processing errors:\s*(\d+)").ok();
    let re_detected = Regex::new(r"(?i)^\s*Detected:\s*(\d+)").ok();
    let re_password = Regex::new(r"(?i)^\s*Password protected:\s*(\d+)").ok();
    let re_corrupted = Regex::new(r"(?i)^\s*Corrupted:\s*(\d+)").ok();

    // Regex patterns for detections
    let re_detection =
        Regex::new(r"(?i)Threat\s*<(?P<threat>.+?)>\s*is detected on object\s*<(?P<object>.+?)>")
            .ok();
    let re_action = Regex::new(
        r"(?i)Action\s*<(?P<action>.+?)>\s*is selected for threat\s*<(?P<threat>.+?)>\s*on object\s*<(?P<object>.+?)>",
    )
    .ok();

    let mut detections_map: std::collections::HashMap<(String, String), KvrtDetection> =
        std::collections::HashMap::new();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Parse counts
        if let Some(ref re) = re_processed {
            if let Some(caps) = re.captures(line) {
                if let Ok(n) = caps.get(1).map_or("0", |m| m.as_str()).parse() {
                    result.processed = Some(n);
                }
            }
        }
        if let Some(ref re) = re_errors {
            if let Some(caps) = re.captures(line) {
                if let Ok(n) = caps.get(1).map_or("0", |m| m.as_str()).parse() {
                    result.processing_errors = Some(n);
                }
            }
        }
        if let Some(ref re) = re_detected {
            if let Some(caps) = re.captures(line) {
                if let Ok(n) = caps.get(1).map_or("0", |m| m.as_str()).parse() {
                    result.detected = Some(n);
                }
            }
        }
        if let Some(ref re) = re_password {
            if let Some(caps) = re.captures(line) {
                if let Ok(n) = caps.get(1).map_or("0", |m| m.as_str()).parse() {
                    result.password_protected = Some(n);
                }
            }
        }
        if let Some(ref re) = re_corrupted {
            if let Some(caps) = re.captures(line) {
                if let Ok(n) = caps.get(1).map_or("0", |m| m.as_str()).parse() {
                    result.corrupted = Some(n);
                }
            }
        }

        // Parse detections
        if let Some(ref re) = re_detection {
            if let Some(caps) = re.captures(line) {
                let threat = caps
                    .name("threat")
                    .map_or("", |m| m.as_str())
                    .trim()
                    .to_string();
                let obj = caps
                    .name("object")
                    .map_or("", |m| m.as_str())
                    .trim()
                    .to_string();
                let key = (threat.clone(), obj.clone());
                detections_map.entry(key).or_insert(KvrtDetection {
                    threat,
                    object_path: obj,
                    action: None,
                });
            }
        }

        // Parse actions
        if let Some(ref re) = re_action {
            if let Some(caps) = re.captures(line) {
                let action = caps
                    .name("action")
                    .map_or("", |m| m.as_str())
                    .trim()
                    .to_string();
                let threat = caps
                    .name("threat")
                    .map_or("", |m| m.as_str())
                    .trim()
                    .to_string();
                let obj = caps
                    .name("object")
                    .map_or("", |m| m.as_str())
                    .trim()
                    .to_string();
                let key = (threat.clone(), obj.clone());

                if let Some(entry) = detections_map.get_mut(&key) {
                    entry.action = Some(action.clone());
                } else {
                    detections_map.insert(
                        key,
                        KvrtDetection {
                            threat,
                            object_path: obj,
                            action: Some(action.clone()),
                        },
                    );
                }

                // Count removals
                let action_lower = action.to_lowercase();
                if action_lower.contains("delete")
                    || action_lower.contains("disinfect")
                    || action_lower.contains("quarantine")
                    || action_lower.contains("neutraliz")
                    || action_lower.contains("remove")
                {
                    result.removed_count += 1;
                }
            }
        }
    }

    result.detections = detections_map.into_values().collect();
    result
}
