//! CHKDSK Filesystem Check Service
//!
//! Runs Windows built-in `chkdsk.exe` to check filesystem integrity.
//! Supports three modes: read_only, fix_errors (/f), and comprehensive (/f /r).

use std::process::{Command, Stdio};
use std::time::Instant;

use chrono::Utc;
use regex::Regex;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::services::Service;
use crate::types::{
    FindingSeverity, SelectOption, ServiceDefinition, ServiceFinding, ServiceOptionSchema,
    ServiceResult,
};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct ChkdskService;

impl Service for ChkdskService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "chkdsk".to_string(),
            name: "Disk Check (CHKDSK)".to_string(),
            description: "Check filesystem integrity and optionally repair errors".to_string(),
            category: "maintenance".to_string(),
            estimated_duration_secs: 300,
            required_programs: vec![], // Built-in Windows tool
            options: vec![
                ServiceOptionSchema {
                    id: "drive".to_string(),
                    label: "Drive".to_string(),
                    option_type: "string".to_string(),
                    default_value: json!("C:"),
                    min: None,
                    max: None,
                    options: None,
                    description: Some("Drive letter to check (e.g., C:, D:)".to_string()),
                },
                ServiceOptionSchema {
                    id: "mode".to_string(),
                    label: "Check Mode".to_string(),
                    option_type: "select".to_string(),
                    default_value: json!("read_only"),
                    min: None,
                    max: None,
                    options: Some(vec![
                        SelectOption {
                            value: "read_only".to_string(),
                            label: "Read Only (Safe)".to_string(),
                        },
                        SelectOption {
                            value: "fix_errors".to_string(),
                            label: "Fix Errors (/f)".to_string(),
                        },
                        SelectOption {
                            value: "comprehensive".to_string(),
                            label: "Comprehensive (/f /r)".to_string(),
                        },
                    ]),
                    description: Some(
                        "Scan mode - read_only is safe, fix_errors may require reboot".to_string(),
                    ),
                },
                ServiceOptionSchema {
                    id: "schedule_if_busy".to_string(),
                    label: "Schedule if Volume Busy".to_string(),
                    option_type: "boolean".to_string(),
                    default_value: json!(false),
                    min: None,
                    max: None,
                    options: None,
                    description: Some(
                        "Automatically schedule check for next reboot if volume is in use"
                            .to_string(),
                    ),
                },
            ],
            icon: "hard-drive-download".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "chkdsk";

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

        // Parse options
        let drive = normalize_drive(
            options
                .get("drive")
                .and_then(|v| v.as_str())
                .unwrap_or("C:"),
        );
        let mode = options
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("read_only");
        let schedule_if_busy = options
            .get("schedule_if_busy")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        emit_log(
            &format!("Starting CHKDSK on {} (mode: {})", drive, mode),
            &mut logs,
            app,
        );

        // Validate mode
        if !["read_only", "fix_errors", "comprehensive"].contains(&mode) {
            emit_log(&format!("ERROR: Invalid mode: {}", mode), &mut logs, app);
            findings.push(ServiceFinding {
                severity: FindingSeverity::Error,
                title: "Invalid Mode".to_string(),
                description: format!(
                    "Mode '{}' is not valid. Use read_only, fix_errors, or comprehensive.",
                    mode
                ),
                recommendation: None,
                data: Some(json!({"type": "error", "reason": "invalid_mode"})),
            });
            return ServiceResult {
                service_id: service_id.to_string(),
                success: false,
                error: Some(format!("Invalid mode: {}", mode)),
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
            };
        }

        // Build command arguments
        let mut args = vec![drive.clone()];
        if mode == "fix_errors" {
            args.push("/f".to_string());
        } else if mode == "comprehensive" {
            args.push("/f".to_string());
            args.push("/r".to_string());
        }

        emit_log(
            &format!("Running: chkdsk {}", args.join(" ")),
            &mut logs,
            app,
        );

        if mode != "read_only" {
            emit_log(
                "Note: Fix modes may require exclusive access or reboot",
                &mut logs,
                app,
            );
        }

        // Execute CHKDSK
        let mut cmd = Command::new("chkdsk");
        cmd.args(&args);

        // If schedule_if_busy, we'll pipe "Y" to stdin for prompts
        if schedule_if_busy && mode != "read_only" {
            cmd.stdin(Stdio::piped());
        }

        let output = match cmd.output() {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to run CHKDSK: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Execution Failed".to_string(),
                    description: format!("Could not execute CHKDSK: {}", e),
                    recommendation: Some(
                        "Ensure you are running with administrator privileges.".to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "execution_failed"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("CHKDSK execution failed: {}", e)),
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
            &format!("CHKDSK completed with exit code: {}", exit_code),
            &mut logs,
            app,
        );

        // Parse output
        let parsed = parse_chkdsk_output(&stdout);

        // Log key findings
        if parsed.found_no_problems {
            emit_log("No problems found on disk", &mut logs, app);
        }
        if parsed.errors_found {
            emit_log("Errors were detected on disk", &mut logs, app);
        }
        if parsed.made_corrections {
            emit_log("Corrections were made to the filesystem", &mut logs, app);
        }
        if parsed.volume_in_use {
            emit_log("Volume is currently in use", &mut logs, app);
        }
        if let Some(ref fs_type) = parsed.filesystem_type {
            emit_log(&format!("Filesystem type: {}", fs_type), &mut logs, app);
        }

        // Determine status and create findings
        let (severity, title, description) = if parsed.access_denied {
            (
                FindingSeverity::Error,
                "Access Denied".to_string(),
                "CHKDSK requires administrator privileges.".to_string(),
            )
        } else if parsed.invalid_drive {
            (
                FindingSeverity::Error,
                "Invalid Drive".to_string(),
                format!("Drive {} not found or is invalid.", drive),
            )
        } else if parsed.found_no_problems {
            (
                FindingSeverity::Success,
                "Disk Healthy".to_string(),
                format!("No problems found on {}. Filesystem is healthy.", drive),
            )
        } else if parsed.made_corrections {
            (
                FindingSeverity::Success,
                "Issues Repaired".to_string(),
                format!("Filesystem errors on {} were successfully repaired.", drive),
            )
        } else if parsed.errors_found && mode == "read_only" {
            (
                FindingSeverity::Warning,
                "Errors Detected".to_string(),
                format!(
                    "Errors found on {}. Run with fix_errors mode to repair.",
                    drive
                ),
            )
        } else if parsed.volume_in_use {
            if schedule_if_busy {
                (
                    FindingSeverity::Info,
                    "Scheduled for Reboot".to_string(),
                    format!("Volume {} is in use. Check scheduled for next boot.", drive),
                )
            } else {
                (
                    FindingSeverity::Warning,
                    "Volume In Use".to_string(),
                    format!(
                        "Cannot check {} while in use. Enable 'Schedule if Busy' option.",
                        drive
                    ),
                )
            }
        } else if exit_code == 0 {
            (
                FindingSeverity::Success,
                "Scan Complete".to_string(),
                format!("CHKDSK completed successfully on {}.", drive),
            )
        } else {
            (
                FindingSeverity::Warning,
                "Check Complete".to_string(),
                format!("CHKDSK finished with exit code {}.", exit_code),
            )
        };

        findings.push(ServiceFinding {
            severity,
            title,
            description,
            recommendation: if parsed.errors_found && mode == "read_only" {
                Some("Run CHKDSK with 'Fix Errors' mode to repair detected issues.".to_string())
            } else if parsed.volume_in_use && !schedule_if_busy {
                Some("Enable 'Schedule if Busy' to check this volume on next reboot.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "chkdsk_result",
                "drive": drive,
                "mode": mode,
                "filesystemType": parsed.filesystem_type,
                "foundNoProblems": parsed.found_no_problems,
                "errorsFound": parsed.errors_found,
                "madeCorrections": parsed.made_corrections,
                "volumeInUse": parsed.volume_in_use,
                "accessDenied": parsed.access_denied,
                "invalidDrive": parsed.invalid_drive,
                "totalDiskKb": parsed.total_disk_kb,
                "availableKb": parsed.available_kb,
                "badSectorsKb": parsed.bad_sectors_kb,
                "inFilesKb": parsed.in_files_kb,
                "systemUseKb": parsed.system_use_kb,
                "durationSeconds": parsed.duration_seconds,
                "exitCode": exit_code,
            })),
        });

        // Log stderr if present
        if !stderr.is_empty() && stderr.len() < 500 {
            emit_log(&format!("Stderr: {}", stderr.trim()), &mut logs, app);
        }

        emit_log("CHKDSK scan complete", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: exit_code == 0 || parsed.found_no_problems || parsed.made_corrections,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            findings,
            logs,
        }
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Normalize drive letter to standard format (e.g., "C:")
fn normalize_drive(drive: &str) -> String {
    let d = drive.trim().replace("/", "\\");

    // Handle various formats: "C", "C:", "C:\\", "C:\\path"
    if d.is_empty() {
        return "C:".to_string();
    }

    let first_char = d.chars().next().unwrap().to_ascii_uppercase();
    if !first_char.is_ascii_alphabetic() {
        return "C:".to_string();
    }

    format!("{}:", first_char)
}

// =============================================================================
// Output Parsing
// =============================================================================

#[derive(Debug, Default)]
struct ChkdskParsedOutput {
    found_no_problems: bool,
    errors_found: bool,
    volume_in_use: bool,
    made_corrections: bool,
    access_denied: bool,
    invalid_drive: bool,
    filesystem_type: Option<String>,
    total_disk_kb: Option<u64>,
    in_files_kb: Option<u64>,
    bad_sectors_kb: Option<u64>,
    system_use_kb: Option<u64>,
    available_kb: Option<u64>,
    duration_seconds: Option<f64>,
}

fn parse_chkdsk_output(output: &str) -> ChkdskParsedOutput {
    let mut result = ChkdskParsedOutput::default();

    // Boolean pattern checks
    let lower = output.to_lowercase();

    result.found_no_problems =
        lower.contains("found no problems") || lower.contains("no further action is required");

    result.errors_found = lower.contains("windows found errors")
        || lower.contains("errors found")
        || lower.contains("chkdsk cannot continue");

    result.volume_in_use = lower.contains("volume is in use")
        || lower.contains("cannot lock")
        || lower.contains("cannot run because");

    result.made_corrections = lower.contains("made corrections to the file system");

    result.access_denied =
        lower.contains("access denied") || lower.contains("insufficient privileges");

    result.invalid_drive =
        lower.contains("cannot find the drive") || lower.contains("invalid drive");

    // Extract filesystem type
    if let Some(re) = Regex::new(r"(?i)The type of the file system is (\w+)").ok() {
        if let Some(caps) = re.captures(output) {
            result.filesystem_type = caps.get(1).map(|m| m.as_str().to_string());
        }
    }

    // Extract numeric values
    result.total_disk_kb = extract_kb_value(r"(\d[\d,]*)\s+KB total disk space", output);
    result.in_files_kb = extract_kb_value(r"(\d[\d,]*)\s+KB in \d+ files", output);
    result.bad_sectors_kb = extract_kb_value(r"(\d[\d,]*)\s+KB in bad sectors", output);
    result.system_use_kb = extract_kb_value(r"(\d[\d,]*)\s+KB in use by the system", output);
    result.available_kb = extract_kb_value(r"(\d[\d,]*)\s+KB available on disk", output);

    // Extract duration
    if let Some(re) = Regex::new(r"Total duration:\s*[^()]*\((\d+)\s*ms\)").ok() {
        if let Some(caps) = re.captures(output) {
            if let Ok(ms) = caps
                .get(1)
                .map_or("0", |m| m.as_str())
                .replace(",", "")
                .parse::<u64>()
            {
                result.duration_seconds = Some(ms as f64 / 1000.0);
            }
        }
    }

    result
}

fn extract_kb_value(pattern: &str, text: &str) -> Option<u64> {
    Regex::new(pattern).ok().and_then(|re| {
        re.captures(text).and_then(|caps| {
            caps.get(1)
                .map(|m| m.as_str().replace(",", ""))
                .and_then(|s| s.parse().ok())
        })
    })
}
