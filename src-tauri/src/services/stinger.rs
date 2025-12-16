//! Trellix Stinger Antivirus Scan Service
//!
//! Executes Trellix Stinger (stinger64.exe) with configurable options,
//! captures results, and parses the generated HTML log file.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use regex::Regex;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::commands::{get_data_dir_path, get_program_exe_path};
use crate::services::Service;
use crate::types::{
    FindingSeverity, SelectOption, ServiceDefinition, ServiceFinding, ServiceOptionSchema,
    ServiceResult,
};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct StingerService;

impl Service for StingerService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "stinger".to_string(),
            name: "Antivirus Scan (Stinger)".to_string(),
            description: "Scan for malware using Trellix Stinger antivirus tool".to_string(),
            category: "security".to_string(),
            estimated_duration_secs: 600,
            required_programs: vec!["stinger".to_string()],
            options: vec![
                ServiceOptionSchema {
                    id: "action".to_string(),
                    label: "Action on Threats".to_string(),
                    option_type: "select".to_string(),
                    default_value: json!("report"),
                    min: None,
                    max: None,
                    options: Some(vec![
                        SelectOption {
                            value: "report".to_string(),
                            label: "Report Only (Safe)".to_string(),
                        },
                        SelectOption {
                            value: "delete".to_string(),
                            label: "Delete Threats".to_string(),
                        },
                    ]),
                    description: Some("Action to take when threats are found".to_string()),
                },
                ServiceOptionSchema {
                    id: "include_pups".to_string(),
                    label: "Detect PUPs".to_string(),
                    option_type: "boolean".to_string(),
                    default_value: json!(false),
                    min: None,
                    max: None,
                    options: None,
                    description: Some("Include potentially unwanted programs in scan".to_string()),
                },
                ServiceOptionSchema {
                    id: "scan_path".to_string(),
                    label: "Scan Path (Optional)".to_string(),
                    option_type: "string".to_string(),
                    default_value: json!(""),
                    min: None,
                    max: None,
                    options: None,
                    description: Some("Specific folder to scan (empty for smart scan)".to_string()),
                },
            ],
            icon: "bug".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "stinger";

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

        emit_log("Starting Trellix Stinger antivirus scan...", &mut logs, app);

        // Get Stinger executable path
        let exe_path = match get_program_exe_path("stinger".to_string()) {
            Ok(Some(path)) => path,
            Ok(None) => {
                emit_log("ERROR: Stinger executable not found", &mut logs, app);
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Stinger Not Found".to_string(),
                    description: "Trellix Stinger executable was not found.".to_string(),
                    recommendation: Some(
                        "Download Stinger from Trellix and place it in the programs folder."
                            .to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "exe_not_found"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("Stinger executable not found".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to locate Stinger: {}", e),
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

        emit_log(&format!("Found Stinger at: {}", exe_path), &mut logs, app);

        // Parse options
        let action = options
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("report");
        let include_pups = options
            .get("include_pups")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let scan_path = options
            .get("scan_path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();

        // Setup logs directory
        let logs_dir = get_data_dir_path().join("logs").join("Stinger");
        if let Err(e) = fs::create_dir_all(&logs_dir) {
            emit_log(
                &format!("Warning: Could not create logs directory: {}", e),
                &mut logs,
                app,
            );
        }

        // Build command arguments
        let mut args: Vec<String> = vec![
            "--GO".to_string(),     // CLI mode (required)
            "--SILENT".to_string(), // No UI windows
            format!("--REPORTPATH={}", logs_dir.to_string_lossy()),
        ];

        // Scan scope
        if !scan_path.is_empty() {
            if Path::new(scan_path).exists() {
                args.push(format!("--SCANPATH={}", scan_path));
                // For folder scans, disable system-wide scans
                args.extend([
                    "--NOBOOT".to_string(),
                    "--NOPROCESS".to_string(),
                    "--NOREGISTRY".to_string(),
                    "--NOROOTKIT".to_string(),
                    "--NOWMI".to_string(),
                ]);
                emit_log(&format!("Scanning path: {}", scan_path), &mut logs, app);
            } else {
                emit_log(
                    &format!(
                        "Warning: Scan path '{}' not found, using smart scan",
                        scan_path
                    ),
                    &mut logs,
                    app,
                );
            }
        } else {
            emit_log("Using smart scan (common infection areas)", &mut logs, app);
        }

        // Action on threats
        if action == "delete" {
            args.push("--DELETE".to_string());
            emit_log("Mode: Delete threats", &mut logs, app);
        } else {
            args.push("--REPORTONLY".to_string());
            emit_log("Mode: Report only (no changes)", &mut logs, app);
        }

        // PUP detection
        if include_pups {
            args.push("--PROGRAM".to_string());
            emit_log("PUP detection enabled", &mut logs, app);
        }

        emit_log(
            "Running scan (this may take several minutes)...",
            &mut logs,
            app,
        );

        // Delete Stinger.opt to avoid conflicts with previous settings
        let stinger_dir = Path::new(&exe_path).parent().unwrap_or(Path::new("."));
        let opt_file = stinger_dir.join("Stinger.opt");
        if opt_file.exists() {
            let _ = fs::remove_file(&opt_file);
        }

        // Execute Stinger
        let output = match Command::new(&exe_path)
            .args(&args)
            .current_dir(stinger_dir)
            .output()
        {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to execute Stinger: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Execution Failed".to_string(),
                    description: format!("Failed to run Stinger: {}", e),
                    recommendation: Some(
                        "Ensure Stinger is accessible and you have administrator privileges."
                            .to_string(),
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

        let _stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        emit_log(
            &format!("Stinger completed with exit code: {}", exit_code),
            &mut logs,
            app,
        );

        // Find and parse the log file
        let log_file = find_latest_stinger_log(&logs_dir);
        let parsed = if let Some(ref log_path) = log_file {
            emit_log(
                &format!("Parsing log: {}", log_path.display()),
                &mut logs,
                app,
            );
            parse_stinger_log(log_path)
        } else {
            emit_log("Warning: No log file found", &mut logs, app);
            StingerParsedOutput::default()
        };

        // Log summary
        if let Some(total) = parsed.total_files {
            emit_log(&format!("Files scanned: {}", total), &mut logs, app);
        }
        let infection_count = parsed.infections.len();
        if infection_count > 0 {
            emit_log(
                &format!("Infections found: {}", infection_count),
                &mut logs,
                app,
            );
        } else {
            emit_log("No infections detected", &mut logs, app);
        }

        // Determine status and create findings
        let (severity, title, description) = if exit_code != 0 && log_file.is_none() {
            (
                FindingSeverity::Error,
                "Scan Failed".to_string(),
                format!(
                    "Stinger exited with code {} and no log was produced.",
                    exit_code
                ),
            )
        } else if infection_count > 0 {
            if action == "delete" {
                (
                    FindingSeverity::Warning,
                    "Threats Removed".to_string(),
                    format!(
                        "{} threat(s) were detected and removal was attempted.",
                        infection_count
                    ),
                )
            } else {
                (
                    FindingSeverity::Error,
                    "Threats Detected".to_string(),
                    format!(
                        "{} threat(s) detected. Run with 'Delete' action to remove.",
                        infection_count
                    ),
                )
            }
        } else {
            (
                FindingSeverity::Success,
                "No Threats Found".to_string(),
                format!(
                    "Stinger scan complete. {} files scanned, no threats detected.",
                    parsed.total_files.unwrap_or(0)
                ),
            )
        };

        findings.push(ServiceFinding {
            severity: severity.clone(),
            title,
            description,
            recommendation: if infection_count > 0 && action == "report" {
                Some(
                    "Run again with 'Delete Threats' action to remove detected malware."
                        .to_string(),
                )
            } else {
                None
            },
            data: Some(json!({
                "type": "stinger_result",
                "action": action,
                "includePups": include_pups,
                "scanPath": if scan_path.is_empty() { None } else { Some(scan_path) },
                "version": parsed.version,
                "engineVersion": parsed.engine_version,
                "virusDataVersion": parsed.virus_data_version,
                "virusCount": parsed.virus_count,
                "scanStartTime": parsed.scan_start_time,
                "scanEndTime": parsed.scan_end_time,
                "totalFiles": parsed.total_files,
                "cleanFiles": parsed.clean_files,
                "notScanned": parsed.not_scanned,
                "infectedFiles": parsed.infected_files,
                "infections": parsed.infections,
                "exitCode": exit_code,
            })),
        });

        // Add individual infection findings
        for infection in &parsed.infections {
            findings.push(ServiceFinding {
                severity: if action == "delete" {
                    FindingSeverity::Warning
                } else {
                    FindingSeverity::Error
                },
                title: infection.threat_name.clone(),
                description: format!("Found in: {}", infection.file_path),
                recommendation: None,
                data: Some(json!({
                    "type": "stinger_infection",
                    "filePath": infection.file_path,
                    "md5": infection.md5,
                    "threatName": infection.threat_name,
                })),
            });
        }

        // Log stderr if present
        if !stderr.is_empty() && stderr.len() < 500 {
            emit_log(&format!("Stderr: {}", stderr.trim()), &mut logs, app);
        }

        emit_log("Stinger scan complete", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: exit_code == 0 || (log_file.is_some() && infection_count == 0),
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

/// Find the most recent Stinger log file in the given directory
fn find_latest_stinger_log(dir: &Path) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }

    fs::read_dir(dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("Stinger_") && n.ends_with(".html"))
                    .unwrap_or(false)
        })
        .max_by_key(|path| {
            path.metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
        })
}

// =============================================================================
// Output Parsing
// =============================================================================

#[derive(Debug, Clone, Default, serde::Serialize)]
struct StingerInfection {
    file_path: String,
    md5: String,
    threat_name: String,
}

#[derive(Debug, Default)]
struct StingerParsedOutput {
    version: Option<String>,
    engine_version: Option<String>,
    virus_data_version: Option<String>,
    virus_count: Option<u32>,
    scan_start_time: Option<String>,
    scan_end_time: Option<String>,
    total_files: Option<u32>,
    clean_files: Option<u32>,
    not_scanned: Option<u32>,
    infected_files: Option<u32>,
    infections: Vec<StingerInfection>,
}

fn parse_stinger_log(log_path: &Path) -> StingerParsedOutput {
    let mut result = StingerParsedOutput::default();

    // Read log file with multiple encoding attempts
    let content = read_log_file(log_path);
    if content.is_empty() {
        return result;
    }

    // Compile regex patterns
    let re_version = Regex::new(r"(?i)Trellix Stinger.*?Version\s+([\d.]+)\s+built on").ok();
    let re_engine = Regex::new(r"(?i)AV Engine version\s+(v[\d.]+)\s+for Windows").ok();
    let re_virus_data = Regex::new(
        r"(?i)Virus data file\s+(v[\d.]+)\s+created on.*?Ready to scan for\s+(\d+)\s+viruses",
    )
    .ok();
    let re_scan_start = Regex::new(r"(?i)(?:Custom )?[Ss]can initiated on\s+(.+?)$").ok();
    let re_scan_end = Regex::new(r"(?i)Scan completed on\s+(.+?)$").ok();
    let re_infection =
        Regex::new(r"(?i)(.+?)\s+\[MD5:([a-f0-9]{32})\]\s+is infected with\s+(.+?)$").ok();
    let re_total = Regex::new(r"(?i)TotalFiles:\.*\s*(\d+)").ok();
    let re_clean = Regex::new(r"(?i)Clean:\.*\s*(\d+)").ok();
    let re_not_scanned = Regex::new(r"(?i)Not Scanned:\.*\s*(\d+)").ok();
    let re_infected = Regex::new(r"(?i)Possibly Infected:\.*\s*(\d+)").ok();

    // Extract version info
    if let Some(ref re) = re_version {
        if let Some(caps) = re.captures(&content) {
            result.version = caps.get(1).map(|m| m.as_str().to_string());
        }
    }
    if let Some(ref re) = re_engine {
        if let Some(caps) = re.captures(&content) {
            result.engine_version = caps.get(1).map(|m| m.as_str().to_string());
        }
    }
    if let Some(ref re) = re_virus_data {
        if let Some(caps) = re.captures(&content) {
            result.virus_data_version = caps.get(1).map(|m| m.as_str().to_string());
            result.virus_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
        }
    }

    // Extract scan times
    if let Some(ref re) = re_scan_start {
        if let Some(caps) = re.captures(&content) {
            result.scan_start_time = caps.get(1).map(|m| m.as_str().trim().to_string());
        }
    }
    if let Some(ref re) = re_scan_end {
        if let Some(caps) = re.captures(&content) {
            result.scan_end_time = caps.get(1).map(|m| m.as_str().trim().to_string());
        }
    }

    // Extract infections
    if let Some(ref re) = re_infection {
        for caps in re.captures_iter(&content) {
            if let (Some(path), Some(md5), Some(threat)) = (caps.get(1), caps.get(2), caps.get(3)) {
                result.infections.push(StingerInfection {
                    file_path: path.as_str().trim().to_string(),
                    md5: md5.as_str().to_string(),
                    threat_name: threat.as_str().trim().to_string(),
                });
            }
        }
    }

    // Extract counts
    if let Some(ref re) = re_total {
        if let Some(caps) = re.captures(&content) {
            result.total_files = caps.get(1).and_then(|m| m.as_str().parse().ok());
        }
    }
    if let Some(ref re) = re_clean {
        if let Some(caps) = re.captures(&content) {
            result.clean_files = caps.get(1).and_then(|m| m.as_str().parse().ok());
        }
    }
    if let Some(ref re) = re_not_scanned {
        if let Some(caps) = re.captures(&content) {
            result.not_scanned = caps.get(1).and_then(|m| m.as_str().parse().ok());
        }
    }
    if let Some(ref re) = re_infected {
        if let Some(caps) = re.captures(&content) {
            result.infected_files = caps.get(1).and_then(|m| m.as_str().parse().ok());
        }
    }

    // Use infections list count if infected_files not parsed
    if result.infected_files.is_none() && !result.infections.is_empty() {
        result.infected_files = Some(result.infections.len() as u32);
    }

    result
}

/// Read log file with multiple encoding attempts
fn read_log_file(path: &Path) -> String {
    // Try UTF-8 first
    if let Ok(content) = fs::read_to_string(path) {
        return content;
    }

    // Try reading as bytes and decode
    if let Ok(bytes) = fs::read(path) {
        // Try UTF-16LE
        if bytes.len() >= 2 {
            let u16_iter = bytes
                .chunks_exact(2)
                .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]));
            let u16_vec: Vec<u16> = u16_iter.collect();
            if let Ok(decoded) = String::from_utf16(&u16_vec) {
                return decoded.trim_start_matches('\u{feff}').to_string();
            }
        }

        // Fallback to lossy UTF-8
        return String::from_utf8_lossy(&bytes).to_string();
    }

    String::new()
}
