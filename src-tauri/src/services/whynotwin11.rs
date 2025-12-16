//! WhyNotWin11 Compatibility Check Service
//!
//! Runs the WhyNotWin11 tool to check Windows 11 compatibility
//! and reports pass/fail status for each requirement.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::commands::get_program_exe_path;
use crate::services::Service;
use crate::types::{FindingSeverity, ServiceDefinition, ServiceFinding, ServiceResult};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct WhyNotWin11Service;

impl Service for WhyNotWin11Service {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "whynotwin11".to_string(),
            name: "Windows 11 Compatibility".to_string(),
            description: "Checks if this PC meets Windows 11 requirements".to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 15,
            required_programs: vec!["whynotwin11".to_string()],
            options: vec![],
            icon: "monitor-check".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let mut success = true;
        let mut error: Option<String> = None;
        let service_id = "whynotwin11";

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

        emit_log("Starting Windows 11 compatibility check...", &mut logs, app);

        // Get executable path
        let exe_path = match get_program_exe_path("whynotwin11".to_string()) {
            Ok(Some(path)) => path,
            Ok(None) => {
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("WhyNotWin11 executable not found".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings: vec![],
                    logs,
                };
            }
            Err(e) => {
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("Failed to get executable path: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings: vec![],
                    logs,
                };
            }
        };

        emit_log(&format!("Using executable: {}", exe_path), &mut logs, app);

        // Create temp CSV file path
        let work_dir = PathBuf::from(&exe_path)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(std::env::temp_dir);
        let csv_path = work_dir.join("whynotwin11_result.csv");

        // Run WhyNotWin11 with CSV export
        emit_log("Running compatibility check...", &mut logs, app);
        let output = Command::new(&exe_path)
            .args([
                "/export",
                "CSV",
                csv_path.to_string_lossy().as_ref(),
                "/silent",
            ])
            .current_dir(&work_dir)
            .output();

        match output {
            Ok(output) => {
                if !output.status.success() {
                    emit_log(
                        &format!(
                            "Warning: Process exited with code {:?}",
                            output.status.code()
                        ),
                        &mut logs,
                        app,
                    );
                }

                // Try to find the CSV file (WhyNotWin11 may put it in different locations)
                let candidates = vec![
                    csv_path.clone(),
                    work_dir.join("App").join("WhyNotWin11").join("result.csv"),
                    work_dir.join("result.csv"),
                ];

                let found_csv = candidates.iter().find(|p| p.exists());

                if let Some(csv_file) = found_csv {
                    emit_log(
                        &format!("Reading results from: {}", csv_file.display()),
                        &mut logs,
                        app,
                    );

                    match parse_whynotwin11_csv(csv_file) {
                        Ok(result) => {
                            let failing_checks: Vec<&str> = result
                                .checks
                                .iter()
                                .filter(|(_, passed)| !**passed)
                                .map(|(name, _)| name.as_str())
                                .collect();

                            let passing_checks: Vec<&str> = result
                                .checks
                                .iter()
                                .filter(|(_, passed)| **passed)
                                .map(|(name, _)| name.as_str())
                                .collect();

                            let ready = failing_checks.is_empty() && !passing_checks.is_empty();

                            // Log results
                            emit_log(
                                &format!(
                                    "Compatibility check complete: {} checks passed, {} failed",
                                    passing_checks.len(),
                                    failing_checks.len()
                                ),
                                &mut logs,
                                app,
                            );

                            if !failing_checks.is_empty() {
                                emit_log(
                                    &format!("Failing checks: {}", failing_checks.join(", ")),
                                    &mut logs,
                                    app,
                                );
                            }

                            // Create main finding
                            let severity = if ready {
                                FindingSeverity::Success
                            } else {
                                FindingSeverity::Warning
                            };

                            findings.push(ServiceFinding {
                                severity,
                                title: if ready {
                                    "Windows 11 Compatible".to_string()
                                } else {
                                    "Windows 11 Not Compatible".to_string()
                                },
                                description: if ready {
                                    "This PC meets all Windows 11 requirements.".to_string()
                                } else {
                                    format!(
                                        "This PC does not meet {} Windows 11 requirement(s): {}",
                                        failing_checks.len(),
                                        failing_checks.join(", ")
                                    )
                                },
                                recommendation: if !ready {
                                    Some(get_recommendations(&failing_checks))
                                } else {
                                    None
                                },
                                data: Some(json!({
                                    "type": "whynotwin11_result",
                                    "ready": ready,
                                    "hostname": result.hostname,
                                    "checks": result.checks,
                                    "failingChecks": failing_checks,
                                    "passingChecks": passing_checks,
                                })),
                            });
                        }
                        Err(e) => {
                            success = false;
                            error = Some(format!("Failed to parse CSV: {}", e));
                            emit_log(&format!("Error parsing CSV: {}", e), &mut logs, app);
                        }
                    }

                    // Cleanup temp CSV
                    let _ = fs::remove_file(csv_file);
                } else {
                    success = false;
                    error = Some("CSV result file not found".to_string());
                    emit_log("Error: CSV result file not found", &mut logs, app);

                    // Log stdout/stderr for debugging
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    if !stdout.is_empty() {
                        emit_log(&format!("stdout: {}", stdout), &mut logs, app);
                    }
                    if !stderr.is_empty() {
                        emit_log(&format!("stderr: {}", stderr), &mut logs, app);
                    }
                }
            }
            Err(e) => {
                success = false;
                error = Some(format!("Failed to execute WhyNotWin11: {}", e));
                emit_log(&format!("Error: {}", e), &mut logs, app);
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
}

// =============================================================================
// CSV Parsing
// =============================================================================

struct WhyNotWin11Result {
    hostname: Option<String>,
    checks: HashMap<String, bool>,
}

fn parse_whynotwin11_csv(path: &PathBuf) -> Result<WhyNotWin11Result, String> {
    // Try multiple encodings
    let encodings = ["utf-8-sig", "utf-8", "utf-16", "windows-1252"];
    let mut content: Option<String> = None;

    for enc in encodings {
        let result = match enc {
            "utf-8-sig" => {
                fs::read(path).ok().and_then(|bytes| {
                    // Strip BOM if present
                    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
                        &bytes[3..]
                    } else {
                        &bytes
                    };
                    String::from_utf8(bytes.to_vec()).ok()
                })
            }
            "utf-16" => {
                fs::read(path).ok().and_then(|bytes| {
                    // Try UTF-16 LE
                    let u16_chars: Vec<u16> = bytes
                        .chunks_exact(2)
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .collect();
                    String::from_utf16(&u16_chars).ok()
                })
            }
            _ => fs::read_to_string(path).ok(),
        };

        if let Some(c) = result {
            if !c.is_empty() {
                content = Some(c);
                break;
            }
        }
    }

    let content = content.ok_or("Failed to read CSV with any encoding")?;

    // Parse CSV
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Err("Empty CSV file".to_string());
    }

    let (header, row) = if lines.len() >= 2 {
        (parse_csv_line(lines[0]), parse_csv_line(lines[1]))
    } else {
        // Single line - might be just data
        (Vec::new(), parse_csv_line(lines[0]))
    };

    // Default columns if no header
    let default_columns = vec![
        "Hostname",
        "Architecture",
        "Boot Method",
        "CPU Compatibility",
        "CPU Core Count",
        "CPU Frequency",
        "DirectX + WDDM2",
        "Disk Partition Type",
        "RAM Installed",
        "Secure Boot",
        "Storage Available",
        "TPM Version",
    ];

    let columns: Vec<&str> = if header.is_empty() && row.len() == default_columns.len() {
        default_columns
    } else {
        header.iter().map(|s| s.as_str()).collect()
    };

    let mut result = WhyNotWin11Result {
        hostname: None,
        checks: HashMap::new(),
    };

    let known_bool_cols = [
        "Architecture",
        "Boot Method",
        "CPU Compatibility",
        "CPU Core Count",
        "CPU Frequency",
        "DirectX + WDDM2",
        "Disk Partition Type",
        "RAM Installed",
        "Secure Boot",
        "Storage Available",
        "TPM Version",
    ];

    for (i, col) in columns.iter().enumerate() {
        if i >= row.len() {
            break;
        }

        let value = &row[i];

        if col.to_lowercase() == "hostname" {
            result.hostname = Some(value.to_string());
        } else if known_bool_cols.contains(col) {
            let parsed = parse_bool_value(value);
            if let Some(b) = parsed {
                result.checks.insert(col.to_string(), b);
            }
        }
    }

    Ok(result)
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in line.chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ',' if !in_quotes => {
                values.push(current.trim().to_string());
                current = String::new();
            }
            _ => current.push(ch),
        }
    }
    values.push(current.trim().to_string());
    values
}

fn parse_bool_value(s: &str) -> Option<bool> {
    let v = s.trim().to_lowercase();
    match v.as_str() {
        "true" | "yes" | "1" | "pass" | "passed" => Some(true),
        "false" | "no" | "0" | "fail" | "failed" => Some(false),
        _ => None,
    }
}

fn get_recommendations(failing_checks: &[&str]) -> String {
    let mut recommendations = Vec::new();

    for check in failing_checks {
        let rec = match *check {
            "TPM Version" => {
                "TPM 2.0 is required. Check BIOS settings or consider a TPM module upgrade."
            }
            "Secure Boot" => "Enable Secure Boot in BIOS/UEFI settings.",
            "CPU Compatibility" => {
                "CPU is not on the Windows 11 supported list. Hardware upgrade may be required."
            }
            "RAM Installed" => "At least 4GB RAM is required for Windows 11.",
            "Storage Available" => "At least 64GB of storage is required for Windows 11.",
            "Boot Method" => "UEFI boot is required. Legacy BIOS mode is not supported.",
            "Disk Partition Type" => "GPT partition style is required. MBR is not supported.",
            "Architecture" => "64-bit processor is required.",
            "DirectX + WDDM2" => {
                "DirectX 12 compatible graphics card with WDDM 2.0 driver is required."
            }
            _ => "Check system requirements for this component.",
        };
        recommendations.push(format!("- {}: {}", check, rec));
    }

    recommendations.join("\n")
}
