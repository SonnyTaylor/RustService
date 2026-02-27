//! Installed Software Audit Service
//!
//! Queries the Windows Registry for all installed programs.
//! Reports software name, version, publisher, install date, and size.

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

pub struct InstalledSoftwareService;

impl Service for InstalledSoftwareService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "installed-software".to_string(),
            name: "Installed Software Audit".to_string(),
            description:
                "Full inventory of installed programs with sizes, versions, and install dates"
                    .to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 10,
            required_programs: vec![], // Uses PowerShell + Registry
            options: vec![ServiceOptionSchema {
                id: "include_updates".to_string(),
                label: "Include Windows Updates".to_string(),
                option_type: "boolean".to_string(),
                default_value: json!(false),
                min: None,
                max: None,
                options: None,
                description: Some(
                    "Include Windows updates and hotfixes in the list".to_string(),
                ),
            }],
            icon: "package-search".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "installed-software";

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

        let include_updates = options
            .get("include_updates")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        emit_log("Querying installed software from registry...", &mut logs, app);

        // PowerShell command to read both HKLM and HKCU uninstall keys
        let ps_script = r#"
$paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$apps = foreach ($path in $paths) {
    Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, EstimatedSize, SystemComponent, ReleaseType, ParentKeyName
}
$apps | ConvertTo-Json -Depth 3
"#;

        let output = match Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                ps_script,
            ])
            .output()
        {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to run PowerShell: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Software Audit Failed".to_string(),
                    description: format!("Could not query registry: {}", e),
                    recommendation: Some("Ensure PowerShell is available.".to_string()),
                    data: Some(json!({"type": "installed_software", "error": true})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("PowerShell execution failed: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                    agent_analysis: None,
                };
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();

        emit_log("Parsing software inventory...", &mut logs, app);

        // Parse JSON output
        let raw_apps: Vec<serde_json::Value> = match serde_json::from_str(&stdout) {
            Ok(serde_json::Value::Array(arr)) => arr,
            Ok(single) => vec![single], // Single result returns as object, not array
            Err(e) => {
                emit_log(
                    &format!("Warning: JSON parse error, trying line-by-line: {}", e),
                    &mut logs,
                    app,
                );
                Vec::new()
            }
        };

        // Process and filter apps
        let mut programs: Vec<ProgramInfo> = Vec::new();
        let mut seen_names = std::collections::HashSet::new();

        for app_val in &raw_apps {
            let name = app_val
                .get("DisplayName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if name.is_empty() {
                continue;
            }

            // Skip system components unless they want updates
            let is_system = app_val
                .get("SystemComponent")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
                == 1;
            let release_type = app_val
                .get("ReleaseType")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let is_update = release_type == "Update"
                || release_type == "Security Update"
                || release_type == "Hotfix"
                || name.starts_with("KB")
                || app_val.get("ParentKeyName").is_some();

            if !include_updates && (is_system || is_update) {
                continue;
            }

            // Deduplicate
            if !seen_names.insert(name.clone()) {
                continue;
            }

            let version = app_val
                .get("DisplayVersion")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let publisher = app_val
                .get("Publisher")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let install_date = app_val
                .get("InstallDate")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let size_kb = app_val
                .get("EstimatedSize")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            programs.push(ProgramInfo {
                name,
                version,
                publisher,
                install_date,
                size_kb,
            });
        }

        // Sort by size (largest first)
        programs.sort_by(|a, b| b.size_kb.cmp(&a.size_kb));

        let total_size_mb: f64 = programs.iter().map(|p| p.size_kb as f64).sum::<f64>() / 1024.0;
        let total_count = programs.len();

        emit_log(
            &format!(
                "Found {} programs, total estimated size: {:.1} MB",
                total_count, total_size_mb
            ),
            &mut logs,
            app,
        );

        // Build program data for renderer
        let program_data: Vec<serde_json::Value> = programs
            .iter()
            .map(|p| {
                json!({
                    "name": p.name,
                    "version": p.version,
                    "publisher": p.publisher,
                    "installDate": p.install_date,
                    "sizeMb": p.size_kb as f64 / 1024.0,
                })
            })
            .collect();

        // Top 10 by size
        let top_by_size: Vec<serde_json::Value> = programs
            .iter()
            .take(10)
            .filter(|p| p.size_kb > 0)
            .map(|p| {
                json!({
                    "name": p.name,
                    "sizeMb": p.size_kb as f64 / 1024.0,
                })
            })
            .collect();

        // Recently installed (parse date YYYYMMDD format)
        let mut recent: Vec<&ProgramInfo> = programs
            .iter()
            .filter(|p| !p.install_date.is_empty() && p.install_date.len() >= 8)
            .collect();
        recent.sort_by(|a, b| b.install_date.cmp(&a.install_date));
        let recent_data: Vec<serde_json::Value> = recent
            .iter()
            .take(10)
            .map(|p| {
                json!({
                    "name": p.name,
                    "version": p.version,
                    "installDate": format_install_date(&p.install_date),
                })
            })
            .collect();

        findings.push(ServiceFinding {
            severity: FindingSeverity::Info,
            title: format!("{} Programs Installed", total_count),
            description: format!(
                "{} programs found. Total estimated disk usage: {:.1} MB. Largest: {}",
                total_count,
                total_size_mb,
                programs
                    .first()
                    .map(|p| format!("{} ({:.0} MB)", p.name, p.size_kb as f64 / 1024.0))
                    .unwrap_or_else(|| "N/A".to_string())
            ),
            recommendation: None,
            data: Some(json!({
                "type": "installed_software",
                "totalPrograms": total_count,
                "totalSizeMb": total_size_mb,
                "programs": program_data,
                "topBySize": top_by_size,
                "recentlyInstalled": recent_data,
                "includeUpdates": include_updates,
            })),
        });

        emit_log("Software audit complete.", &mut logs, app);

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
// Types & Helpers
// =============================================================================

struct ProgramInfo {
    name: String,
    version: String,
    publisher: String,
    install_date: String, // YYYYMMDD format from registry
    size_kb: u64,
}

/// Format YYYYMMDD to YYYY-MM-DD
fn format_install_date(date: &str) -> String {
    if date.len() >= 8 {
        format!("{}-{}-{}", &date[0..4], &date[4..6], &date[6..8])
    } else {
        date.to_string()
    }
}
