//! Windows Update Service
//!
//! Uses PowerShell with PSWindowsUpdate module to scan for and install updates.
//! Reports on available updates, installed updates, and reboot requirements.

use std::fs;
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

pub struct WindowsUpdateService;

impl Service for WindowsUpdateService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "windows-update".to_string(),
            name: "Windows Update".to_string(),
            description: "Check for and install Windows updates".to_string(),
            category: "maintenance".to_string(),
            estimated_duration_secs: 600, // Updates can take a while
            required_programs: vec![],    // Uses built-in PowerShell
            options: vec![
                ServiceOptionSchema {
                    id: "install_updates".to_string(),
                    label: "Install Updates".to_string(),
                    option_type: "boolean".to_string(),
                    default_value: json!(true),
                    min: None,
                    max: None,
                    options: None,
                    description: Some(
                        "Install available updates (uncheck to scan only)".to_string(),
                    ),
                },
                ServiceOptionSchema {
                    id: "include_drivers".to_string(),
                    label: "Include Drivers".to_string(),
                    option_type: "boolean".to_string(),
                    default_value: json!(true),
                    min: None,
                    max: None,
                    options: None,
                    description: Some("Include Microsoft driver updates".to_string()),
                },
            ],
            icon: "cloud-download".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "windows-update";

        // Parse options
        let install_updates = options
            .get("install_updates")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let include_drivers = options
            .get("include_drivers")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

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

        emit_log("Starting Windows Update check...", &mut logs, app);
        emit_log(
            &format!(
                "Mode: {}, Include Drivers: {}",
                if install_updates {
                    "Install"
                } else {
                    "Scan Only"
                },
                include_drivers
            ),
            &mut logs,
            app,
        );

        // Build PowerShell script
        let script = build_update_script(install_updates, include_drivers);

        // Create temp file for script
        let temp_dir = std::env::temp_dir();
        let script_path = temp_dir.join("rustservice_wu_script.ps1");

        if let Err(e) = fs::write(&script_path, &script) {
            emit_log(
                &format!("ERROR: Could not write script: {}", e),
                &mut logs,
                app,
            );
            return ServiceResult {
                service_id: service_id.to_string(),
                success: false,
                error: Some(format!("Failed to write script: {}", e)),
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
            };
        }

        emit_log(
            "Executing Windows Update PowerShell script...",
            &mut logs,
            app,
        );
        emit_log("This may take several minutes...", &mut logs, app);

        // Execute PowerShell
        let output = match Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                &script_path.to_string_lossy(),
            ])
            .output()
        {
            Ok(output) => output,
            Err(e) => {
                let _ = fs::remove_file(&script_path);
                emit_log(
                    &format!("ERROR: Failed to run PowerShell: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "PowerShell Execution Failed".to_string(),
                    description: format!("Could not execute PowerShell script: {}", e),
                    recommendation: Some(
                        "Ensure PowerShell is available and accessible.".to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "execution_failed"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("PowerShell execution failed: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
        };

        // Clean up temp file
        let _ = fs::remove_file(&script_path);

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);

        emit_log(
            &format!("PowerShell completed with exit code: {}", exit_code),
            &mut logs,
            app,
        );

        // Parse JSON output from script
        let parsed = parse_update_output(&stdout);

        // Log results
        emit_log(
            &format!("Available updates: {}", parsed.available_count),
            &mut logs,
            app,
        );
        if install_updates {
            emit_log(
                &format!("Installed updates: {}", parsed.installed_count),
                &mut logs,
                app,
            );
            emit_log(
                &format!("Failed updates: {}", parsed.failed_count),
                &mut logs,
                app,
            );
        }
        if parsed.reboot_required {
            emit_log("Reboot is required to complete updates", &mut logs, app);
        }

        // Log any stderr (usually module installation messages)
        if !stderr.is_empty() {
            for line in stderr.lines().take(10) {
                if !line.trim().is_empty() {
                    emit_log(&format!("[PS] {}", line), &mut logs, app);
                }
            }
        }

        // Determine status
        let mode_desc = if install_updates {
            "installation"
        } else {
            "scan"
        };
        let (severity, title, description) = if parsed.error.is_some() {
            (
                FindingSeverity::Error,
                "Update Check Failed".to_string(),
                parsed.error.clone().unwrap_or("Unknown error".to_string()),
            )
        } else if !install_updates {
            // Scan only mode
            if parsed.available_count > 0 {
                (
                    FindingSeverity::Warning,
                    format!("{} Update(s) Available", parsed.available_count),
                    format!(
                        "Found {} available update(s). Run with 'Install Updates' enabled to install.",
                        parsed.available_count
                    ),
                )
            } else {
                (
                    FindingSeverity::Success,
                    "System Up to Date".to_string(),
                    "No updates available. Windows is up to date.".to_string(),
                )
            }
        } else {
            // Install mode
            if parsed.failed_count > 0 {
                (
                    FindingSeverity::Warning,
                    format!("{} Update(s) Failed", parsed.failed_count),
                    format!(
                        "Installed {} update(s), but {} failed. {} remaining.",
                        parsed.installed_count, parsed.failed_count, parsed.remaining_count
                    ),
                )
            } else if parsed.installed_count > 0 {
                (
                    FindingSeverity::Success,
                    format!("{} Update(s) Installed", parsed.installed_count),
                    format!(
                        "Successfully installed {} update(s).{}",
                        parsed.installed_count,
                        if parsed.reboot_required {
                            " Reboot required."
                        } else {
                            ""
                        }
                    ),
                )
            } else if parsed.available_count == 0 {
                (
                    FindingSeverity::Success,
                    "System Up to Date".to_string(),
                    "No updates needed. Windows is up to date.".to_string(),
                )
            } else {
                (
                    FindingSeverity::Info,
                    "No Updates Installed".to_string(),
                    format!(
                        "{} update(s) are available but were not installed.",
                        parsed.available_count
                    ),
                )
            }
        };

        findings.push(ServiceFinding {
            severity,
            title,
            description,
            recommendation: if parsed.reboot_required {
                Some("Restart the computer to complete update installation.".to_string())
            } else if parsed.failed_count > 0 {
                Some("Try running Windows Update again or check for known issues.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "windows_update_result",
                "mode": mode_desc,
                "include_drivers": include_drivers,
                "available_count": parsed.available_count,
                "installed_count": parsed.installed_count,
                "failed_count": parsed.failed_count,
                "remaining_count": parsed.remaining_count,
                "reboot_required": parsed.reboot_required,
                "updates": parsed.updates,
            })),
        });

        emit_log(
            &format!("Windows Update {} complete", mode_desc),
            &mut logs,
            app,
        );

        ServiceResult {
            service_id: service_id.to_string(),
            success: parsed.error.is_none() && parsed.failed_count == 0,
            error: parsed.error,
            duration_ms: start.elapsed().as_millis() as u64,
            findings,
            logs,
        }
    }
}

// =============================================================================
// PowerShell Script Builder
// =============================================================================

fn build_update_script(install: bool, include_drivers: bool) -> String {
    let mu_flag = if include_drivers {
        "-MicrosoftUpdate"
    } else {
        ""
    };
    let install_cmd = if install {
        format!(
            r#"
try {{
    Write-Host "[WU] Installing updates..."
    $installResult = Install-WindowsUpdate -AcceptAll -IgnoreReboot {} -Confirm:$false -ErrorAction Continue
    if ($installResult) {{
        foreach ($u in $installResult) {{
            $installed += @([PSCustomObject]@{{
                Title = $u.Title
                KB = $u.KB
                Result = $u.Result
            }})
            if ($u.Result -match 'Installed') {{ $installedCount++ }}
            elseif ($u.Result -match 'Failed') {{ $failedCount++ }}
        }}
    }}
}} catch {{
    Write-Host "[WU] Install error: $_"
    $errorMsg = $_.ToString()
}}
"#,
            mu_flag
        )
    } else {
        String::new()
    };

    format!(
        r#"
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

# Ensure PSWindowsUpdate module
try {{
    if (-not (Get-Module -ListAvailable -Name 'PSWindowsUpdate')) {{
        Write-Host "[WU] Installing PSWindowsUpdate module..."
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -ErrorAction SilentlyContinue | Out-Null
        Set-PSRepository -Name 'PSGallery' -InstallationPolicy Trusted -ErrorAction SilentlyContinue
        Install-Module -Name 'PSWindowsUpdate' -Force -Scope CurrentUser -AllowClobber -ErrorAction Stop
    }}
    Import-Module 'PSWindowsUpdate' -ErrorAction Stop
}} catch {{
    @{{ error = "Failed to load PSWindowsUpdate: $_" }} | ConvertTo-Json
    exit 1
}}

Write-Host "[WU] Scanning for updates..."

$available = @()
$installed = @()
$installedCount = 0
$failedCount = 0
$errorMsg = $null

# Get available updates
try {{
    $updates = Get-WindowsUpdate {} -ErrorAction Continue
    if ($updates) {{
        foreach ($u in $updates) {{
            $available += @([PSCustomObject]@{{
                Title = $u.Title
                KB = $u.KB
                Size = $u.Size
                IsDriver = ($u.Categories | ForEach-Object {{ $_.Name }}) -match 'driver'
            }})
        }}
    }}
}} catch {{
    Write-Host "[WU] Scan error: $_"
    $errorMsg = $_.ToString()
}}

{}

# Check reboot status
$rebootRequired = $false
try {{
    $rebootRequired = (Get-WURebootStatus -Silent).RebootRequired
}} catch {{
    $rebootRequired = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
}}

# Get remaining updates
$remaining = @()
try {{
    $postUpdates = Get-WindowsUpdate {} -ErrorAction SilentlyContinue
    if ($postUpdates) {{
        foreach ($u in $postUpdates) {{
            $remaining += @([PSCustomObject]@{{
                Title = $u.Title
                KB = $u.KB
            }})
        }}
    }}
}} catch {{ }}

# Output JSON
@{{
    available_count = $available.Count
    installed_count = $installedCount
    failed_count = $failedCount
    remaining_count = $remaining.Count
    reboot_required = $rebootRequired
    updates = $available
    installed = $installed
    error = $errorMsg
}} | ConvertTo-Json -Depth 5
"#,
        mu_flag, install_cmd, mu_flag
    )
}

// =============================================================================
// Output Parsing
// =============================================================================

#[derive(Debug, Default)]
struct UpdateResult {
    available_count: u32,
    installed_count: u32,
    failed_count: u32,
    remaining_count: u32,
    reboot_required: bool,
    updates: Vec<serde_json::Value>,
    error: Option<String>,
}

fn parse_update_output(output: &str) -> UpdateResult {
    let mut result = UpdateResult::default();

    // Find JSON in output (skip Write-Host lines)
    let json_start = output.find('{');
    let json_end = output.rfind('}');

    if let (Some(start), Some(end)) = (json_start, json_end) {
        if end > start {
            let json_str = &output[start..=end];
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                result.available_count = parsed["available_count"].as_u64().unwrap_or(0) as u32;
                result.installed_count = parsed["installed_count"].as_u64().unwrap_or(0) as u32;
                result.failed_count = parsed["failed_count"].as_u64().unwrap_or(0) as u32;
                result.remaining_count = parsed["remaining_count"].as_u64().unwrap_or(0) as u32;
                result.reboot_required = parsed["reboot_required"].as_bool().unwrap_or(false);

                if let Some(updates) = parsed["updates"].as_array() {
                    result.updates = updates.clone();
                }

                if let Some(err) = parsed["error"].as_str() {
                    if !err.is_empty() {
                        result.error = Some(err.to_string());
                    }
                }
            }
        }
    }

    result
}
