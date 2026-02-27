//! Energy Report Service
//!
//! Runs Windows `powercfg /energy` to generate a power efficiency diagnostics report.
//! Parses the HTML output to extract errors, warnings, and informational items.
//! Requires administrator privileges.

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

pub struct EnergyReportService;

impl Service for EnergyReportService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "energy-report".to_string(),
            name: "Energy Report".to_string(),
            description:
                "Analyze power efficiency and identify battery drain issues using powercfg"
                    .to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 75, // duration + processing
            required_programs: vec![],   // Built-in Windows tool
            options: vec![ServiceOptionSchema {
                id: "duration".to_string(),
                label: "Trace Duration (seconds)".to_string(),
                option_type: "number".to_string(),
                default_value: json!(10),
                min: Some(5.0),
                max: Some(60.0),
                options: None,
                description: Some(
                    "How long to trace system activity before generating the report".to_string(),
                ),
            }],
            icon: "zap".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "energy-report";

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

        let duration = options
            .get("duration")
            .and_then(|v| v.as_u64())
            .unwrap_or(10) as u32;

        // Use temp directory for output
        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("rustservice_energy_report.html");
        let output_path_str = output_path.to_string_lossy().to_string();

        emit_log(
            &format!("Starting energy efficiency trace ({} seconds)...", duration),
            &mut logs,
            app,
        );
        emit_log(
            "Please avoid using the computer during the trace for best results.",
            &mut logs,
            app,
        );

        // Run powercfg /energy
        let result = Command::new("powercfg")
            .args([
                "/energy",
                "/output",
                &output_path_str,
                "/duration",
                &duration.to_string(),
            ])
            .output();

        let output = match result {
            Ok(output) => output,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to run powercfg: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Energy Report Failed".to_string(),
                    description: format!("Could not execute powercfg: {}", e),
                    recommendation: Some(
                        "Ensure you are running with administrator privileges.".to_string(),
                    ),
                    data: Some(json!({"type": "energy_report", "error": true})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("powercfg execution failed: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                    agent_analysis: None,
                };
            }
        };

        let exit_code = output.status.code().unwrap_or(-1);
        let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();

        emit_log(
            &format!("powercfg exited with code: {}", exit_code),
            &mut logs,
            app,
        );

        // Read and parse the HTML report
        let html_content = match std::fs::read_to_string(&output_path) {
            Ok(content) => content,
            Err(e) => {
                // If we can't read the output, check if access was denied
                let err_msg = if stderr_str.contains("requires elevated permissions")
                    || stderr_str.contains("Access is denied")
                    || exit_code != 0
                {
                    "Administrator privileges are required to generate an energy report."
                        .to_string()
                } else {
                    format!("Could not read energy report: {}", e)
                };

                emit_log(&format!("ERROR: {}", err_msg), &mut logs, app);
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Report Generation Failed".to_string(),
                    description: err_msg,
                    recommendation: Some(
                        "Run this application as administrator and try again.".to_string(),
                    ),
                    data: Some(json!({"type": "energy_report", "error": true})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("Failed to generate energy report".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                    agent_analysis: None,
                };
            }
        };

        emit_log("Parsing energy report...", &mut logs, app);

        // Parse the HTML for errors, warnings, and informational items
        let parsed = parse_energy_html(&html_content);

        emit_log(
            &format!(
                "Found {} errors, {} warnings, {} informational items",
                parsed.errors.len(),
                parsed.warnings.len(),
                parsed.informational.len()
            ),
            &mut logs,
            app,
        );

        // Determine overall severity
        let overall_severity = if !parsed.errors.is_empty() {
            FindingSeverity::Warning
        } else if !parsed.warnings.is_empty() {
            FindingSeverity::Info
        } else {
            FindingSeverity::Success
        };

        let overall_title = if !parsed.errors.is_empty() {
            format!(
                "Power Issues Found: {} error(s), {} warning(s)",
                parsed.errors.len(),
                parsed.warnings.len()
            )
        } else if !parsed.warnings.is_empty() {
            format!("{} Warning(s) Found", parsed.warnings.len())
        } else {
            "No Power Issues Detected".to_string()
        };

        let overall_description = format!(
            "Energy efficiency analysis complete. {} error(s), {} warning(s), {} informational item(s) found during the {}-second trace.",
            parsed.errors.len(),
            parsed.warnings.len(),
            parsed.informational.len(),
            duration
        );

        // Build structured data for renderer
        let items: Vec<serde_json::Value> = parsed
            .errors
            .iter()
            .map(|item| {
                json!({
                    "severity": "error",
                    "category": item.category,
                    "title": item.title,
                    "description": item.description,
                })
            })
            .chain(parsed.warnings.iter().map(|item| {
                json!({
                    "severity": "warning",
                    "category": item.category,
                    "title": item.title,
                    "description": item.description,
                })
            }))
            .chain(parsed.informational.iter().map(|item| {
                json!({
                    "severity": "info",
                    "category": item.category,
                    "title": item.title,
                    "description": item.description,
                })
            }))
            .collect();

        findings.push(ServiceFinding {
            severity: overall_severity,
            title: overall_title,
            description: overall_description,
            recommendation: if !parsed.errors.is_empty() {
                Some("Review the power errors and adjust power settings accordingly.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "energy_report",
                "errorCount": parsed.errors.len(),
                "warningCount": parsed.warnings.len(),
                "infoCount": parsed.informational.len(),
                "items": items,
                "duration": duration,
            })),
        });

        // Add individual findings for errors
        for item in &parsed.errors {
            findings.push(ServiceFinding {
                severity: FindingSeverity::Warning,
                title: item.title.clone(),
                description: item.description.clone(),
                recommendation: Some("Check power settings and running applications.".to_string()),
                data: None,
            });
        }

        // Clean up temp file
        let _ = std::fs::remove_file(&output_path);

        emit_log("Energy report analysis complete.", &mut logs, app);

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
// HTML Parser
// =============================================================================

struct EnergyItem {
    category: String,
    title: String,
    description: String,
}

struct ParsedReport {
    errors: Vec<EnergyItem>,
    warnings: Vec<EnergyItem>,
    informational: Vec<EnergyItem>,
}

fn parse_energy_html(html: &str) -> ParsedReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut informational = Vec::new();

    // The powercfg /energy HTML has sections with specific CSS classes
    // Errors: <td class="pointed_out_err">
    // Warnings: <td class="pointed_out_wrn">
    // Info: <td class="pointed_out_inf">
    // Each section has a title in <span class="pointed_out_title_X"> and details in subsequent rows

    let mut current_section: Option<&str> = None;
    let mut current_category = String::new();
    let mut current_title = String::new();
    let mut current_desc_lines: Vec<String> = Vec::new();
    let mut in_item = false;

    for line in html.lines() {
        let trimmed = line.trim();

        // Detect section headers
        if trimmed.contains("class=\"pointed_out_err\"")
            || trimmed.contains("class='pointed_out_err'")
        {
            // Save previous item
            if in_item && !current_title.is_empty() {
                save_item(
                    current_section,
                    &current_category,
                    &current_title,
                    &current_desc_lines,
                    &mut errors,
                    &mut warnings,
                    &mut informational,
                );
            }
            current_section = Some("error");
            current_title.clear();
            current_desc_lines.clear();
            in_item = true;
        } else if trimmed.contains("class=\"pointed_out_wrn\"")
            || trimmed.contains("class='pointed_out_wrn'")
        {
            if in_item && !current_title.is_empty() {
                save_item(
                    current_section,
                    &current_category,
                    &current_title,
                    &current_desc_lines,
                    &mut errors,
                    &mut warnings,
                    &mut informational,
                );
            }
            current_section = Some("warning");
            current_title.clear();
            current_desc_lines.clear();
            in_item = true;
        } else if trimmed.contains("class=\"pointed_out_inf\"")
            || trimmed.contains("class='pointed_out_inf'")
        {
            if in_item && !current_title.is_empty() {
                save_item(
                    current_section,
                    &current_category,
                    &current_title,
                    &current_desc_lines,
                    &mut errors,
                    &mut warnings,
                    &mut informational,
                );
            }
            current_section = Some("info");
            current_title.clear();
            current_desc_lines.clear();
            in_item = true;
        }

        // Extract category from section headings like "Power Policy:..."
        if trimmed.contains("pointed_out_title") {
            let text = strip_html_tags(trimmed);
            if !text.is_empty() {
                current_category = text;
            }
        }

        // Extract title and description from table cells
        if in_item {
            if trimmed.starts_with("<td>") && current_title.is_empty() {
                let text = strip_html_tags(trimmed);
                if !text.is_empty() {
                    current_title = text;
                }
            } else if trimmed.starts_with("<td>") && !current_title.is_empty() {
                let text = strip_html_tags(trimmed);
                if !text.is_empty() {
                    current_desc_lines.push(text);
                }
            }
        }
    }

    // Save last item
    if in_item && !current_title.is_empty() {
        save_item(
            current_section,
            &current_category,
            &current_title,
            &current_desc_lines,
            &mut errors,
            &mut warnings,
            &mut informational,
        );
    }

    // Fallback: if no structured data found, try simpler parsing
    if errors.is_empty() && warnings.is_empty() && informational.is_empty() {
        parse_energy_fallback(html, &mut errors, &mut warnings, &mut informational);
    }

    ParsedReport {
        errors,
        warnings,
        informational,
    }
}

fn save_item(
    section: Option<&str>,
    category: &str,
    title: &str,
    desc_lines: &[String],
    errors: &mut Vec<EnergyItem>,
    warnings: &mut Vec<EnergyItem>,
    informational: &mut Vec<EnergyItem>,
) {
    let item = EnergyItem {
        category: category.to_string(),
        title: title.to_string(),
        description: desc_lines.join("; "),
    };
    match section {
        Some("error") => errors.push(item),
        Some("warning") => warnings.push(item),
        Some("info") => informational.push(item),
        _ => {}
    }
}

/// Fallback parser that counts section markers
fn parse_energy_fallback(
    html: &str,
    errors: &mut Vec<EnergyItem>,
    warnings: &mut Vec<EnergyItem>,
    informational: &mut Vec<EnergyItem>,
) {
    // Count occurrences of markers
    let error_count = html.matches("pointed_out_err").count();
    let warning_count = html.matches("pointed_out_wrn").count();
    let info_count = html.matches("pointed_out_inf").count();

    if error_count > 0 {
        errors.push(EnergyItem {
            category: "Power Policy".to_string(),
            title: format!("{} power error(s) detected", error_count),
            description: "The energy report found power configuration errors. Review the full report for details.".to_string(),
        });
    }
    if warning_count > 0 {
        warnings.push(EnergyItem {
            category: "Power Policy".to_string(),
            title: format!("{} power warning(s) detected", warning_count),
            description:
                "The energy report found power warnings. Review the full report for details."
                    .to_string(),
        });
    }
    if info_count > 0 {
        informational.push(EnergyItem {
            category: "General".to_string(),
            title: format!("{} informational item(s)", info_count),
            description: "Additional power information is available in the full report."
                .to_string(),
        });
    }
}

fn strip_html_tags(s: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    result.trim().to_string()
}
