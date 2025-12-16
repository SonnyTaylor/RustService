//! System File Checker (SFC) Service
//!
//! Runs Windows built-in `sfc.exe /scannow` to check system file integrity.
//! Parses UTF-16LE output for integrity violations and repair status.

use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::services::Service;
use crate::types::{FindingSeverity, ServiceDefinition, ServiceFinding, ServiceResult};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct SfcService;

impl Service for SfcService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "sfc".to_string(),
            name: "System File Check".to_string(),
            description: "Scan and repair Windows system files using SFC".to_string(),
            category: "maintenance".to_string(),
            estimated_duration_secs: 600, // SFC can take 10+ minutes
            required_programs: vec![],    // Built-in Windows tool
            options: vec![],
            icon: "file-scan".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "sfc";

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

        emit_log("Starting System File Checker (SFC) scan...", &mut logs, app);
        emit_log(
            "This may take 10-15 minutes. Please wait...",
            &mut logs,
            app,
        );

        // Execute SFC
        let output = match Command::new("sfc").arg("/scannow").output() {
            Ok(output) => output,
            Err(e) => {
                emit_log(&format!("ERROR: Failed to run SFC: {}", e), &mut logs, app);
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "SFC Execution Failed".to_string(),
                    description: format!("Could not execute SFC: {}", e),
                    recommendation: Some(
                        "Ensure you are running with administrator privileges.".to_string(),
                    ),
                    data: Some(json!({"type": "error", "reason": "execution_failed"})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("SFC execution failed: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
        };

        // SFC outputs UTF-16LE on Windows
        let stdout = decode_sfc_output(&output.stdout);
        let stderr = decode_sfc_output(&output.stderr);
        let exit_code = output.status.code().unwrap_or(-1);

        emit_log(
            &format!("SFC completed with exit code: {}", exit_code),
            &mut logs,
            app,
        );

        // Parse the output
        let parsed = parse_sfc_output(&stdout);

        // Log parsed results
        if let Some(violations) = parsed.integrity_violations {
            if violations {
                emit_log("Integrity violations were found", &mut logs, app);
            } else {
                emit_log("No integrity violations found", &mut logs, app);
            }
        }
        if parsed.repairs_attempted {
            emit_log("Repairs were attempted", &mut logs, app);
            if let Some(success) = parsed.repairs_successful {
                emit_log(&format!("Repairs successful: {}", success), &mut logs, app);
            }
        }
        if parsed.pending_reboot {
            emit_log("A pending reboot is required", &mut logs, app);
        }

        // Determine status
        let (severity, title, description) = if parsed.access_denied {
            (
                FindingSeverity::Error,
                "Access Denied".to_string(),
                "SFC requires administrator privileges to run.".to_string(),
            )
        } else if parsed.pending_reboot {
            (
                FindingSeverity::Warning,
                "Reboot Required".to_string(),
                "A system repair is pending. Please reboot before running SFC.".to_string(),
            )
        } else if parsed.winsxs_repair_pending {
            (
                FindingSeverity::Warning,
                "Component Store Issue".to_string(),
                "Component store corruption detected. Run DISM RestoreHealth first.".to_string(),
            )
        } else if parsed.integrity_violations == Some(false) {
            (
                FindingSeverity::Success,
                "System Files Healthy".to_string(),
                "No integrity violations found. All system files are intact.".to_string(),
            )
        } else if parsed.repairs_successful == Some(true) {
            (
                FindingSeverity::Success,
                "Files Repaired".to_string(),
                "Corrupt system files were found and successfully repaired.".to_string(),
            )
        } else if parsed.repairs_successful == Some(false) {
            (
                FindingSeverity::Warning,
                "Repairs Incomplete".to_string(),
                "Some corrupt files could not be repaired. Check CBS.log for details.".to_string(),
            )
        } else if parsed.integrity_violations == Some(true) {
            (
                FindingSeverity::Warning,
                "Issues Detected".to_string(),
                "System file issues were detected. Check CBS.log for details.".to_string(),
            )
        } else if exit_code == 0 {
            (
                FindingSeverity::Success,
                "Scan Complete".to_string(),
                "SFC scan completed successfully.".to_string(),
            )
        } else {
            (
                FindingSeverity::Error,
                "Scan Failed".to_string(),
                format!("SFC scan failed with exit code {}.", exit_code),
            )
        };

        findings.push(ServiceFinding {
            severity,
            title,
            description,
            recommendation: if parsed.winsxs_repair_pending {
                Some("Run 'DISM /Online /Cleanup-Image /RestoreHealth' before SFC.".to_string())
            } else if parsed.repairs_successful == Some(false) {
                Some(
                    "Check C:\\Windows\\Logs\\CBS\\CBS.log for details on failed repairs."
                        .to_string(),
                )
            } else if parsed.pending_reboot {
                Some("Restart the computer and run SFC again.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "sfc_result",
                "integrity_violations": parsed.integrity_violations,
                "repairs_attempted": parsed.repairs_attempted,
                "repairs_successful": parsed.repairs_successful,
                "verification_complete": parsed.verification_complete,
                "pending_reboot": parsed.pending_reboot,
                "winsxs_repair_pending": parsed.winsxs_repair_pending,
                "access_denied": parsed.access_denied,
                "exit_code": exit_code,
            })),
        });

        // Log any stderr
        if !stderr.is_empty() {
            emit_log(&format!("Stderr: {}", stderr.trim()), &mut logs, app);
        }

        emit_log("SFC scan complete", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: exit_code == 0 || parsed.repairs_successful == Some(true),
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
struct SfcResult {
    integrity_violations: Option<bool>,
    repairs_attempted: bool,
    repairs_successful: Option<bool>,
    verification_complete: bool,
    pending_reboot: bool,
    access_denied: bool,
    winsxs_repair_pending: bool,
}

fn decode_sfc_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }

    // SFC often outputs UTF-16LE on Windows (contains null bytes)
    if bytes.contains(&0) {
        // Try UTF-16LE decoding
        let u16_iter = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]));
        let u16_vec: Vec<u16> = u16_iter.collect();
        if let Ok(decoded) = String::from_utf16(&u16_vec) {
            return decoded.trim_start_matches('\u{feff}').to_string();
        }
    }

    // Fallback encodings
    String::from_utf8_lossy(bytes).to_string()
}

fn parse_sfc_output(output: &str) -> SfcResult {
    let mut result = SfcResult::default();

    for line in output.lines() {
        let lower = line.to_lowercase();

        // Check for verification completion
        if lower.contains("verification 100% complete") {
            result.verification_complete = true;
        }

        // Check for access/privilege issues
        if (lower.contains("access") && lower.contains("denied"))
            || lower.contains("must be an administrator")
            || lower.contains("requires elevation")
        {
            result.access_denied = true;
        }

        // Main status patterns
        if lower.contains("did not find any integrity violations") {
            result.integrity_violations = Some(false);
            result.repairs_attempted = false;
        } else if lower.contains("found corrupt files and successfully repaired them") {
            result.integrity_violations = Some(true);
            result.repairs_attempted = true;
            result.repairs_successful = Some(true);
        } else if lower.contains("found corrupt files but was unable to fix some of them") {
            result.integrity_violations = Some(true);
            result.repairs_attempted = true;
            result.repairs_successful = Some(false);
        } else if lower.contains("found corrupt files") && !lower.contains("unable") {
            result.integrity_violations = Some(true);
            result.repairs_attempted = true;
        } else if lower.contains("could not perform the requested operation") {
            result.repairs_successful = Some(false);
        }

        // Check for pending states
        if lower.contains("there is a system repair pending") || lower.contains("pending.xml") {
            result.pending_reboot = true;
        }

        // Check for component store issues
        if lower.contains("component store")
            && (lower.contains("corrupt") || lower.contains("inconsistent"))
        {
            result.winsxs_repair_pending = true;
        }
    }

    result
}
