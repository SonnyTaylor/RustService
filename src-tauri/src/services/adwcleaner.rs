//! AdwCleaner Service
//!
//! Executes AdwCleaner with cleanup mode, parses the resulting log file,
//! and extracts structured results including cleaned item counts.

use std::fs;
use std::path::{Path, PathBuf};
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

pub struct AdwCleanerService;

impl Service for AdwCleanerService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "adwcleaner".to_string(),
            name: "Adware Cleanup".to_string(),
            description: "Removes adware, PUPs, and browser hijackers using AdwCleaner".to_string(),
            category: "cleanup".to_string(),
            estimated_duration_secs: 120,
            required_programs: vec!["adwcleaner".to_string()],
            options: vec![],
            icon: "sparkles".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "adwcleaner";

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

        emit_log("Starting AdwCleaner cleanup...", &mut logs, app);

        // Get AdwCleaner executable path
        let exe_path = match get_program_exe_path("adwcleaner".to_string()) {
            Ok(Some(path)) => path,
            Ok(None) => {
                emit_log("ERROR: AdwCleaner.exe not found", &mut logs, app);
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "AdwCleaner Not Found".to_string(),
                    description: "AdwCleaner executable was not found.".to_string(),
                    recommendation: Some(
                        "Download AdwCleaner from Malwarebytes and place it in the programs folder."
                            .to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "exe_not_found"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("AdwCleaner.exe not found".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to locate AdwCleaner: {}", e),
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
            &format!("Found AdwCleaner at: {}", exe_path),
            &mut logs,
            app,
        );

        // Working directory for AdwCleaner output
        let working_dir = Path::new(&exe_path)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

        // Build command arguments
        // /eula - accept EULA
        // /clean - run cleanup
        // /noreboot - don't reboot automatically
        // /path - set working directory for logs
        let working_dir_str = working_dir.to_string_lossy().to_string();
        let args = vec!["/eula", "/clean", "/noreboot", "/path", &working_dir_str];

        emit_log("Running AdwCleaner cleanup...", &mut logs, app);

        // Execute AdwCleaner
        let output = match Command::new(&exe_path)
            .args(&args)
            .current_dir(&working_dir)
            .output()
        {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to execute AdwCleaner: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Execution Failed".to_string(),
                    description: format!("Failed to run AdwCleaner: {}", e),
                    recommendation: Some(
                        "Ensure AdwCleaner.exe is accessible and not corrupted.".to_string(),
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

        let exit_code = output.status.code().unwrap_or(-1);
        emit_log(
            &format!("AdwCleaner completed with exit code: {}", exit_code),
            &mut logs,
            app,
        );

        if exit_code != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr);
            emit_log(
                &format!("AdwCleaner error output: {}", stderr.trim()),
                &mut logs,
                app,
            );
        }

        // Find and parse the latest log file
        let logs_dir = working_dir.join("AdwCleaner").join("Logs");
        let latest_log = find_latest_log(&logs_dir);

        let parsed = match latest_log {
            Some(log_path) => {
                emit_log(
                    &format!("Parsing log file: {}", log_path.display()),
                    &mut logs,
                    app,
                );
                parse_adwcleaner_log(&log_path)
            }
            None => {
                emit_log(
                    "No log file found, using exit code result only",
                    &mut logs,
                    app,
                );
                AdwCleanerResult::default()
            }
        };

        // Log summary
        emit_log(
            &format!("Items cleaned: {}", parsed.cleaned),
            &mut logs,
            app,
        );
        emit_log(&format!("Items failed: {}", parsed.failed), &mut logs, app);

        // Determine overall severity
        let (severity, status) = if parsed.cleaned > 0 {
            (FindingSeverity::Warning, "Items Cleaned")
        } else if parsed.failed > 0 {
            (FindingSeverity::Error, "Cleanup Had Errors")
        } else {
            (FindingSeverity::Success, "System Clean")
        };

        // Calculate total items found
        let total_items = parsed.registry.len()
            + parsed.files.len()
            + parsed.folders.len()
            + parsed.services.len()
            + parsed.tasks.len()
            + parsed.shortcuts.len()
            + parsed.dlls.len()
            + parsed.wmi.len()
            + parsed.browsers.values().map(|v| v.len()).sum::<usize>()
            + parsed.preinstalled.len();

        // Build categories array separately to avoid json! recursion limit
        let mut categories: Vec<serde_json::Value> = Vec::new();
        if !parsed.registry.is_empty() {
            categories.push(json!({"name": "Registry", "count": parsed.registry.len(), "items": parsed.registry}));
        }
        if !parsed.files.is_empty() {
            categories
                .push(json!({"name": "Files", "count": parsed.files.len(), "items": parsed.files}));
        }
        if !parsed.folders.is_empty() {
            categories.push(
                json!({"name": "Folders", "count": parsed.folders.len(), "items": parsed.folders}),
            );
        }
        if !parsed.services.is_empty() {
            categories.push(json!({"name": "Services", "count": parsed.services.len(), "items": parsed.services}));
        }
        if !parsed.tasks.is_empty() {
            categories
                .push(json!({"name": "Tasks", "count": parsed.tasks.len(), "items": parsed.tasks}));
        }
        if !parsed.shortcuts.is_empty() {
            categories.push(json!({"name": "Shortcuts", "count": parsed.shortcuts.len(), "items": parsed.shortcuts}));
        }
        if !parsed.dlls.is_empty() {
            categories
                .push(json!({"name": "DLLs", "count": parsed.dlls.len(), "items": parsed.dlls}));
        }
        if !parsed.wmi.is_empty() {
            categories.push(json!({"name": "WMI", "count": parsed.wmi.len(), "items": parsed.wmi}));
        }
        if !parsed.preinstalled.is_empty() {
            categories.push(json!({"name": "Preinstalled Software", "count": parsed.preinstalled.len(), "items": parsed.preinstalled}));
        }

        // Create summary finding
        findings.push(ServiceFinding {
            severity: severity.clone(),
            title: status.to_string(),
            description: format!(
                "{} item(s) cleaned, {} failed. Found {} total items across all categories.",
                parsed.cleaned, parsed.failed, total_items
            ),
            recommendation: if parsed.failed > 0 {
                Some("Some items could not be removed. Consider manual review.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "adwcleaner_summary",
                "cleaned": parsed.cleaned,
                "failed": parsed.failed,
                "registry": parsed.registry.len(),
                "files": parsed.files.len(),
                "folders": parsed.folders.len(),
                "services": parsed.services.len(),
                "tasks": parsed.tasks.len(),
                "shortcuts": parsed.shortcuts.len(),
                "dlls": parsed.dlls.len(),
                "wmi": parsed.wmi.len(),
                "browsers": parsed.browsers.iter().map(|(k, v)| (k.clone(), v.len())).collect::<std::collections::HashMap<_, _>>(),
                "preinstalled": parsed.preinstalled.len(),
                "categories": categories,
            })),
        });

        // Add category findings for items found
        let category_counts = vec![
            ("Registry Keys", parsed.registry.len()),
            ("Files", parsed.files.len()),
            ("Folders", parsed.folders.len()),
            ("Services", parsed.services.len()),
            ("Scheduled Tasks", parsed.tasks.len()),
            ("Shortcuts", parsed.shortcuts.len()),
            ("DLLs", parsed.dlls.len()),
            ("WMI Objects", parsed.wmi.len()),
            ("Preinstalled Software", parsed.preinstalled.len()),
        ];

        for (category, count) in category_counts {
            if count > 0 {
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Info,
                    title: format!("{}: {} found", category, count),
                    description: format!("AdwCleaner identified {} {} to clean.", count, category.to_lowercase()),
                    recommendation: None,
                    data: Some(json!({"type": "adwcleaner_category", "category": category, "count": count})),
                });
            }
        }

        // Browser findings
        for (browser, items) in &parsed.browsers {
            if !items.is_empty() {
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Info,
                    title: format!("{}: {} items", browser, items.len()),
                    description: format!("Browser-related items cleaned from {}.", browser),
                    recommendation: None,
                    data: Some(json!({"type": "adwcleaner_browser", "browser": browser, "count": items.len()})),
                });
            }
        }

        emit_log("AdwCleaner cleanup complete", &mut logs, app);

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
// Log Parsing
// =============================================================================

#[derive(Debug, Default)]
struct AdwCleanerResult {
    cleaned: u32,
    failed: u32,
    registry: Vec<String>,
    files: Vec<String>,
    folders: Vec<String>,
    services: Vec<String>,
    tasks: Vec<String>,
    shortcuts: Vec<String>,
    dlls: Vec<String>,
    wmi: Vec<String>,
    browsers: std::collections::HashMap<String, Vec<String>>,
    preinstalled: Vec<String>,
}

fn find_latest_log(logs_dir: &Path) -> Option<PathBuf> {
    if !logs_dir.exists() {
        return None;
    }

    let mut logs: Vec<_> = fs::read_dir(logs_dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.file_name()
                    .map(|n| n.to_string_lossy().starts_with("AdwCleaner"))
                    .unwrap_or(false)
                && p.extension().map(|e| e == "txt").unwrap_or(false)
        })
        .collect();

    logs.sort_by_key(|p| std::cmp::Reverse(p.metadata().ok().map(|m| m.modified().ok()).flatten()));

    logs.into_iter().next()
}

fn parse_adwcleaner_log(log_path: &Path) -> AdwCleanerResult {
    let mut result = AdwCleanerResult::default();

    let content = match fs::read_to_string(log_path) {
        Ok(c) => c,
        Err(_) => return result,
    };

    let mut current_section: Option<&str> = None;

    // Section name mappings
    let section_map: std::collections::HashMap<&str, &str> = [
        ("Services", "services"),
        ("Folders", "folders"),
        ("Files", "files"),
        ("DLL", "dlls"),
        ("WMI", "wmi"),
        ("Shortcuts", "shortcuts"),
        ("Tasks", "tasks"),
        ("Registry", "registry"),
        ("Preinstalled Software", "preinstalled"),
    ]
    .into_iter()
    .collect();

    let browser_sections = [
        "Chromium (and derivatives)",
        "Chromium URLs",
        "Firefox (and derivatives)",
        "Firefox URLs",
        "Hosts File Entries",
    ];

    let re_section = Regex::new(r"\*{5} \[ (.+?) \] \*{5}").ok();

    for line in content.lines() {
        let line = line.trim();

        // Check for cleaned/failed counts
        if line.starts_with("# Cleaned:") {
            if let Some(num_str) = line.split(':').nth(1) {
                result.cleaned = num_str.trim().parse().unwrap_or(0);
            }
        } else if line.starts_with("# Failed:") {
            if let Some(num_str) = line.split(':').nth(1) {
                result.failed = num_str.trim().parse().unwrap_or(0);
            }
        }

        // Check for section headers
        if let Some(ref re) = re_section {
            if let Some(caps) = re.captures(line) {
                let section_name = caps.get(1).map_or("", |m| m.as_str()).trim();
                if section_map.contains_key(section_name) {
                    current_section = Some(section_name);
                } else if browser_sections.contains(&section_name) {
                    current_section = Some(section_name);
                } else {
                    current_section = None;
                }
                continue;
            }
        }

        // Stop at EOF marker
        if line.starts_with("########## EOF") {
            break;
        }

        // Parse section content
        if let Some(section) = current_section {
            if line.is_empty()
                || line.contains("No malicious")
                || line.contains("No Preinstalled")
                || line.starts_with("AdwCleaner[")
            {
                continue;
            }

            if let Some(mapped) = section_map.get(section) {
                match *mapped {
                    "services" => result.services.push(line.to_string()),
                    "folders" => result.folders.push(line.to_string()),
                    "files" => result.files.push(line.to_string()),
                    "dlls" => result.dlls.push(line.to_string()),
                    "wmi" => result.wmi.push(line.to_string()),
                    "shortcuts" => result.shortcuts.push(line.to_string()),
                    "tasks" => result.tasks.push(line.to_string()),
                    "registry" => result.registry.push(line.to_string()),
                    "preinstalled" => result.preinstalled.push(line.to_string()),
                    _ => {}
                }
            } else if browser_sections.contains(&section) {
                result
                    .browsers
                    .entry(section.to_string())
                    .or_default()
                    .push(line.to_string());
            }
        }
    }

    result
}
