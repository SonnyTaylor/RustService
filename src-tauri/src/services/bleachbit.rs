//! BleachBit Cleaning Service
//!
//! Runs BleachBit with selected cleaners and parses console output into
//! structured metrics (space reclaimed, files deleted, etc.).

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

pub struct BleachBitService;

impl Service for BleachBitService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "bleachbit".to_string(),
            name: "System Cleanup".to_string(),
            description: "Clean junk files, temporary data, and browser caches using BleachBit"
                .to_string(),
            category: "cleanup".to_string(),
            estimated_duration_secs: 120,
            required_programs: vec!["bleachbit".to_string()],
            options: vec![],
            icon: "trash-2".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "bleachbit";

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

        emit_log("Starting BleachBit cleanup...", &mut logs, app);

        // Get BleachBit executable path - prefer bleachbit_console.exe
        let exe_path = match get_program_exe_path("bleachbit".to_string()) {
            Ok(Some(path)) => {
                // If we got bleachbit.exe, try to find bleachbit_console.exe in same folder
                let path_obj = Path::new(&path);
                if let Some(parent) = path_obj.parent() {
                    let console_path = parent.join("bleachbit_console.exe");
                    if console_path.exists() {
                        console_path.to_string_lossy().to_string()
                    } else {
                        path
                    }
                } else {
                    path
                }
            }
            Ok(None) => {
                emit_log("ERROR: BleachBit.exe not found", &mut logs, app);
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "BleachBit Not Found".to_string(),
                    description: "BleachBit executable was not found.".to_string(),
                    recommendation: Some(
                        "Download BleachBit from bleachbit.org and place it in the programs folder."
                            .to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "exe_not_found"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("BleachBit.exe not found".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to locate BleachBit: {}", e),
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

        emit_log(&format!("Found BleachBit at: {}", exe_path), &mut logs, app);

        // Default cleaners to run
        let cleaners = vec![
            "system.tmp",
            "system.cache",
            "system.trash",
            "system.logs",
            "windows.logs",
            "windows.prefetch",
            "windows.recycle_bin",
            "windows.updates",
        ];

        // Build command
        let mut args: Vec<&str> = vec!["--clean"];
        for cleaner in &cleaners {
            args.push(cleaner);
        }

        emit_log(
            &format!("Running BleachBit with {} cleaners...", cleaners.len()),
            &mut logs,
            app,
        );

        // Execute BleachBit
        let output = match Command::new(&exe_path).args(&args).output() {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to execute BleachBit: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Execution Failed".to_string(),
                    description: format!("Failed to run BleachBit: {}", e),
                    recommendation: Some(
                        "Ensure BleachBit is accessible and not corrupted.".to_string(),
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
            &format!("BleachBit completed with exit code: {}", exit_code),
            &mut logs,
            app,
        );

        // Parse output
        let parsed = parse_bleachbit_output(&stdout);

        // Log parsed results
        emit_log(
            &format!(
                "Space recovered: {} bytes ({:.2} MB)",
                parsed.space_recovered_bytes,
                parsed.space_recovered_bytes as f64 / (1024.0 * 1024.0)
            ),
            &mut logs,
            app,
        );
        emit_log(
            &format!("Files deleted: {}", parsed.files_deleted),
            &mut logs,
            app,
        );

        // Determine severity based on results
        let (severity, status) = if parsed.errors > 0 {
            (FindingSeverity::Warning, "Cleanup completed with errors")
        } else if parsed.space_recovered_bytes > 0 || parsed.files_deleted > 0 {
            (FindingSeverity::Success, "Cleanup successful")
        } else {
            (FindingSeverity::Info, "No items to clean")
        };

        // Format space for display
        let space_str = format_bytes(parsed.space_recovered_bytes);

        // Main summary finding
        findings.push(ServiceFinding {
            severity: severity.clone(),
            title: status.to_string(),
            description: format!(
                "Recovered {} disk space. {} files deleted. {} errors.",
                space_str, parsed.files_deleted, parsed.errors
            ),
            recommendation: if parsed.errors > 0 {
                Some("Some items could not be cleaned. Consider manual review.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "bleachbit_summary",
                "space_recovered_bytes": parsed.space_recovered_bytes,
                "space_recovered_formatted": space_str,
                "files_deleted": parsed.files_deleted,
                "special_operations": parsed.special_operations,
                "errors": parsed.errors,
            })),
        });

        // Log any stderr output for debugging
        if !stderr.is_empty() && exit_code != 0 {
            emit_log(&format!("Stderr: {}", stderr.trim()), &mut logs, app);
        }

        emit_log("BleachBit cleanup complete", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: exit_code == 0 || parsed.errors == 0,
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
struct BleachBitResult {
    space_recovered_bytes: u64,
    files_deleted: u32,
    special_operations: u32,
    errors: u32,
}

fn parse_bleachbit_output(output: &str) -> BleachBitResult {
    let mut result = BleachBitResult::default();

    // Patterns for parsing BleachBit console output
    let re_space = Regex::new(r"Disk space recovered:\s*(\d+(?:\.\d+)?)\s*([kKmMgG]?[bB]?)").ok();
    let re_files = Regex::new(r"Files deleted:\s*(\d+)").ok();
    let re_special = Regex::new(r"Special operations:\s*(\d+)").ok();
    let re_errors = Regex::new(r"Errors:\s*(\d+)").ok();

    for line in output.lines() {
        if line.contains("Disk space recovered") {
            if let Some(ref re) = re_space {
                if let Some(caps) = re.captures(line) {
                    if let Ok(value) = caps.get(1).map_or("0", |m| m.as_str()).parse::<f64>() {
                        let unit = caps.get(2).map_or("", |m| m.as_str()).to_lowercase();
                        result.space_recovered_bytes = match unit.as_str() {
                            "kb" | "k" => (value * 1024.0) as u64,
                            "mb" | "m" => (value * 1024.0 * 1024.0) as u64,
                            "gb" | "g" => (value * 1024.0 * 1024.0 * 1024.0) as u64,
                            _ => value as u64,
                        };
                    }
                }
            }
        } else if line.contains("Files deleted") {
            if let Some(ref re) = re_files {
                if let Some(caps) = re.captures(line) {
                    result.files_deleted =
                        caps.get(1).map_or(0, |m| m.as_str().parse().unwrap_or(0));
                }
            }
        } else if line.contains("Special operations") {
            if let Some(ref re) = re_special {
                if let Some(caps) = re.captures(line) {
                    result.special_operations =
                        caps.get(1).map_or(0, |m| m.as_str().parse().unwrap_or(0));
                }
            }
        } else if line.contains("Errors") {
            if let Some(ref re) = re_errors {
                if let Some(caps) = re.captures(line) {
                    result.errors = caps.get(1).map_or(0, |m| m.as_str().parse().unwrap_or(0));
                }
            }
        }
    }

    result
}

fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    let units = ["B", "KB", "MB", "GB", "TB"];
    let base = 1024_f64;
    let exp = (bytes as f64).ln() / base.ln();
    let exp = exp.floor() as usize;
    let exp = exp.min(units.len() - 1);
    let value = bytes as f64 / base.powi(exp as i32);
    format!("{:.2} {}", value, units[exp])
}
