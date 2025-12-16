//! DriveCleanup Service
//!
//! Executes Uwe Sieber's DriveCleanup.exe to remove stale device instances
//! and registry entries. Parses console output to extract removal counts.

use std::path::Path;
use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use regex::Regex;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::commands::get_program_exe_path;
use crate::services::Service;
use crate::types::{
    FindingSeverity, ServiceDefinition, ServiceFinding, ServiceOptionSchema, ServiceResult,
};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct DriveCleanupService;

impl Service for DriveCleanupService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "drivecleanup".to_string(),
            name: "Device Cleanup".to_string(),
            description: "Remove stale USB devices, hubs, and registry entries using DriveCleanup"
                .to_string(),
            category: "cleanup".to_string(),
            estimated_duration_secs: 30,
            required_programs: vec!["drivecleanup".to_string()],
            options: vec![ServiceOptionSchema {
                id: "test_only".to_string(),
                label: "Test Only (don't remove)".to_string(),
                option_type: "boolean".to_string(),
                default_value: json!(false),
                min: None,
                max: None,
                options: None,
                description: Some(
                    "Show what would be removed without actually removing".to_string(),
                ),
            }],
            icon: "usb".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "drivecleanup";

        // Parse options
        let test_only = options
            .get("test_only")
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

        emit_log("Starting DriveCleanup...", &mut logs, app);
        if test_only {
            emit_log(
                "Running in TEST mode - no changes will be made",
                &mut logs,
                app,
            );
        }

        // Get executable path
        let exe_path = match get_program_exe_path("drivecleanup".to_string()) {
            Ok(Some(path)) => path,
            Ok(None) => {
                emit_log("ERROR: DriveCleanup.exe not found", &mut logs, app);
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "DriveCleanup Not Found".to_string(),
                    description: "DriveCleanup executable was not found.".to_string(),
                    recommendation: Some(
                        "Download DriveCleanup from Uwe Sieber's site and place it in the programs folder."
                            .to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "exe_not_found"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("DriveCleanup.exe not found".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to locate DriveCleanup: {}", e),
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

        emit_log(
            &format!("Found DriveCleanup at: {}", exe_path),
            &mut logs,
            app,
        );

        // Build command arguments
        let mut args: Vec<&str> = Vec::new();
        if test_only {
            args.push("-t"); // Test only mode
        }
        args.push("-n"); // No wait for keypress

        // Get working directory
        let working_dir = Path::new(&exe_path)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

        emit_log("Running DriveCleanup...", &mut logs, app);

        // Execute DriveCleanup
        let output = match Command::new(&exe_path)
            .args(&args)
            .current_dir(&working_dir)
            .output()
        {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to execute DriveCleanup: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Execution Failed".to_string(),
                    description: format!("Failed to run DriveCleanup: {}", e),
                    recommendation: Some(
                        "Ensure DriveCleanup is accessible and has proper permissions.".to_string(),
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
        let exit_code = output.status.code().unwrap_or(-1);

        emit_log(
            &format!("DriveCleanup completed with exit code: {}", exit_code),
            &mut logs,
            app,
        );

        // Parse output
        let parsed = parse_drivecleanup_output(&stdout);

        // Log parsed results
        emit_log(
            &format!("USB devices removed: {}", parsed.usb_devices.unwrap_or(0)),
            &mut logs,
            app,
        );
        emit_log(
            &format!("USB hubs removed: {}", parsed.usb_hubs.unwrap_or(0)),
            &mut logs,
            app,
        );
        emit_log(
            &format!("Disk devices removed: {}", parsed.disk_devices.unwrap_or(0)),
            &mut logs,
            app,
        );
        emit_log(
            &format!(
                "Registry items removed: {}",
                parsed.registry_items.unwrap_or(0)
            ),
            &mut logs,
            app,
        );

        // Calculate total removed
        let total_removed = parsed.usb_devices.unwrap_or(0)
            + parsed.usb_hubs.unwrap_or(0)
            + parsed.disk_devices.unwrap_or(0)
            + parsed.cdrom_devices.unwrap_or(0)
            + parsed.floppy_devices.unwrap_or(0)
            + parsed.storage_volumes.unwrap_or(0)
            + parsed.wpd_devices.unwrap_or(0)
            + parsed.registry_items.unwrap_or(0);

        // Determine severity
        let mode = if test_only { "identified" } else { "removed" };
        let (severity, status) = if total_removed > 0 {
            (
                FindingSeverity::Success,
                format!("{} stale items {}", total_removed, mode),
            )
        } else {
            (
                FindingSeverity::Info,
                "No stale device entries found".to_string(),
            )
        };

        // Main finding
        findings.push(ServiceFinding {
            severity,
            title: status,
            description: format!(
                "DriveCleanup {} {} USB devices, {} hubs, {} disks, and {} registry items.",
                mode,
                parsed.usb_devices.unwrap_or(0),
                parsed.usb_hubs.unwrap_or(0),
                parsed.disk_devices.unwrap_or(0),
                parsed.registry_items.unwrap_or(0)
            ),
            recommendation: if test_only && total_removed > 0 {
                Some("Run without 'Test Only' to actually remove stale entries.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "drivecleanup_summary",
                "test_only": test_only,
                "total_removed": total_removed,
                "usb_devices": parsed.usb_devices,
                "usb_hubs": parsed.usb_hubs,
                "disk_devices": parsed.disk_devices,
                "cdrom_devices": parsed.cdrom_devices,
                "floppy_devices": parsed.floppy_devices,
                "storage_volumes": parsed.storage_volumes,
                "wpd_devices": parsed.wpd_devices,
                "registry_items": parsed.registry_items,
                "version": parsed.version,
                "arch": parsed.arch,
            })),
        });

        emit_log("DriveCleanup complete", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: exit_code == 0,
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
struct DriveCleanupResult {
    version: Option<String>,
    arch: Option<String>,
    usb_devices: Option<u32>,
    usb_hubs: Option<u32>,
    disk_devices: Option<u32>,
    cdrom_devices: Option<u32>,
    floppy_devices: Option<u32>,
    storage_volumes: Option<u32>,
    wpd_devices: Option<u32>,
    registry_items: Option<u32>,
}

fn parse_drivecleanup_output(output: &str) -> DriveCleanupResult {
    let mut result = DriveCleanupResult::default();

    // Version pattern
    let re_version = Regex::new(r"DriveCleanup\s+V([\d.]+)\s+\((x86|x64)\)").ok();

    // Count patterns
    let patterns: Vec<(&str, Box<dyn Fn(&mut DriveCleanupResult, u32)>)> = vec![
        (
            r"Removed\s+(\d+)\s+USB devices?",
            Box::new(|r: &mut DriveCleanupResult, v| r.usb_devices = Some(v)),
        ),
        (
            r"Removed\s+(\d+)\s+USB hubs?",
            Box::new(|r: &mut DriveCleanupResult, v| r.usb_hubs = Some(v)),
        ),
        (
            r"Removed\s+(\d+)\s+Disk devices?",
            Box::new(|r: &mut DriveCleanupResult, v| r.disk_devices = Some(v)),
        ),
        (
            r"Removed\s+(\d+)\s+CDROM devices?",
            Box::new(|r: &mut DriveCleanupResult, v| r.cdrom_devices = Some(v)),
        ),
        (
            r"Removed\s+(\d+)\s+Floppy devices?",
            Box::new(|r: &mut DriveCleanupResult, v| r.floppy_devices = Some(v)),
        ),
        (
            r"Removed\s+(\d+)\s+Storage volumes?",
            Box::new(|r: &mut DriveCleanupResult, v| r.storage_volumes = Some(v)),
        ),
        (
            r"Removed\s+(\d+)\s+WPD devices?",
            Box::new(|r: &mut DriveCleanupResult, v| r.wpd_devices = Some(v)),
        ),
        (
            r"Removed\s+(\d+)\s+Items? from registry",
            Box::new(|r: &mut DriveCleanupResult, v| r.registry_items = Some(v)),
        ),
    ];

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Check for version
        if result.version.is_none() {
            if let Some(ref re) = re_version {
                if let Some(caps) = re.captures(line) {
                    result.version = Some(caps.get(1).map_or("", |m| m.as_str()).to_string());
                    result.arch = Some(caps.get(2).map_or("", |m| m.as_str()).to_string());
                    continue;
                }
            }
        }

        // Check for counts
        for (pattern, setter) in &patterns {
            if let Ok(re) = Regex::new(pattern) {
                if let Some(caps) = re.captures(line) {
                    if let Some(num) = caps.get(1) {
                        if let Ok(val) = num.as_str().parse::<u32>() {
                            setter(&mut result, val);
                        }
                    }
                }
            }
        }
    }

    result
}
