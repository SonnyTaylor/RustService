//! Battery Report Service
//!
//! Runs Windows `powercfg /batteryreport` to generate a detailed battery health
//! and capacity history report. Parses the HTML output for design capacity,
//! full charge capacity, cycle count, and capacity degradation over time.

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

pub struct BatteryReportService;

impl Service for BatteryReportService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "battery-report".to_string(),
            name: "Battery Report".to_string(),
            description:
                "Detailed battery health, capacity history, and degradation analysis via powercfg"
                    .to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 10,
            required_programs: vec![], // Built-in Windows tool
            options: vec![],
            icon: "battery-charging".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "battery-report";

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

        emit_log("Generating battery report...", &mut logs, app);

        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("rustservice_battery_report.html");
        let output_path_str = output_path.to_string_lossy().to_string();

        let result = Command::new("powercfg")
            .args(["/batteryreport", "/output", &output_path_str])
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
                    title: "Battery Report Failed".to_string(),
                    description: format!("Could not execute powercfg: {}", e),
                    recommendation: Some(
                        "Ensure you are running with administrator privileges.".to_string(),
                    ),
                    data: Some(json!({"type": "battery_report", "error": true})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("powercfg execution failed: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
        };

        let exit_code = output.status.code().unwrap_or(-1);
        let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();

        emit_log(
            &format!("powercfg exited with code: {}", exit_code),
            &mut logs,
            app,
        );

        // Check for no battery
        if stdout_str.contains("no batteries")
            || stderr_str.contains("no batteries")
            || stdout_str.contains("Unable to perform operation")
        {
            emit_log("No battery detected on this system.", &mut logs, app);
            findings.push(ServiceFinding {
                severity: FindingSeverity::Info,
                title: "No Battery Detected".to_string(),
                description: "This system does not have a battery. Battery report is not available on desktop computers.".to_string(),
                recommendation: None,
                data: Some(json!({
                    "type": "battery_report",
                    "noBattery": true,
                })),
            });
            return ServiceResult {
                service_id: service_id.to_string(),
                success: true,
                error: None,
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
            };
        }

        // Read and parse the HTML report
        let html_content = match std::fs::read_to_string(&output_path) {
            Ok(content) => content,
            Err(e) => {
                emit_log(
                    &format!("ERROR: Could not read report file: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Report Read Failed".to_string(),
                    description: format!("Could not read battery report: {}", e),
                    recommendation: Some("Try running as administrator.".to_string()),
                    data: Some(json!({"type": "battery_report", "error": true})),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("Failed to read battery report".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                };
            }
        };

        emit_log("Parsing battery report...", &mut logs, app);

        let parsed = parse_battery_html(&html_content);

        // Calculate health percentage
        let health_percent = if parsed.design_capacity_mwh > 0 && parsed.full_charge_capacity_mwh > 0
        {
            (parsed.full_charge_capacity_mwh as f64 / parsed.design_capacity_mwh as f64 * 100.0)
                .min(100.0)
        } else {
            0.0
        };

        emit_log(
            &format!(
                "Design capacity: {} mWh, Full charge: {} mWh, Health: {:.1}%",
                parsed.design_capacity_mwh, parsed.full_charge_capacity_mwh, health_percent
            ),
            &mut logs,
            app,
        );

        if let Some(cycles) = parsed.cycle_count {
            emit_log(&format!("Cycle count: {}", cycles), &mut logs, app);
        }

        // Determine battery health severity
        let (severity, title) = if health_percent >= 80.0 {
            (
                FindingSeverity::Success,
                format!("Battery Health: {:.1}% — Good", health_percent),
            )
        } else if health_percent >= 50.0 {
            (
                FindingSeverity::Warning,
                format!("Battery Health: {:.1}% — Degraded", health_percent),
            )
        } else if health_percent > 0.0 {
            (
                FindingSeverity::Error,
                format!("Battery Health: {:.1}% — Replace Recommended", health_percent),
            )
        } else {
            (
                FindingSeverity::Info,
                "Battery Health: Unable to determine".to_string(),
            )
        };

        let description = format!(
            "Design capacity: {} mWh | Current full charge: {} mWh | Health: {:.1}%{}",
            parsed.design_capacity_mwh,
            parsed.full_charge_capacity_mwh,
            health_percent,
            parsed
                .cycle_count
                .map(|c| format!(" | Cycles: {}", c))
                .unwrap_or_default()
        );

        let recommendation = if health_percent < 50.0 && health_percent > 0.0 {
            Some(
                "Battery has significantly degraded. Consider replacing the battery.".to_string(),
            )
        } else if health_percent < 80.0 && health_percent > 0.0 {
            Some("Battery is showing wear. Monitor capacity over time.".to_string())
        } else {
            None
        };

        // Build capacity history data for the renderer chart
        let capacity_history: Vec<serde_json::Value> = parsed
            .capacity_history
            .iter()
            .map(|entry| {
                json!({
                    "date": entry.date,
                    "fullChargeCapacity": entry.full_charge_capacity_mwh,
                    "designCapacity": entry.design_capacity_mwh,
                })
            })
            .collect();

        findings.push(ServiceFinding {
            severity,
            title,
            description,
            recommendation,
            data: Some(json!({
                "type": "battery_report",
                "designCapacityMwh": parsed.design_capacity_mwh,
                "fullChargeCapacityMwh": parsed.full_charge_capacity_mwh,
                "healthPercent": health_percent,
                "cycleCount": parsed.cycle_count,
                "capacityHistory": capacity_history,
                "batteryName": parsed.battery_name,
                "manufacturer": parsed.manufacturer,
                "chemistry": parsed.chemistry,
            })),
        });

        // Clean up temp file
        let _ = std::fs::remove_file(&output_path);

        emit_log("Battery report analysis complete.", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            findings,
            logs,
        }
    }
}

// =============================================================================
// HTML Parser
// =============================================================================

struct CapacityHistoryEntry {
    date: String,
    full_charge_capacity_mwh: u64,
    design_capacity_mwh: u64,
}

struct ParsedBatteryReport {
    design_capacity_mwh: u64,
    full_charge_capacity_mwh: u64,
    cycle_count: Option<u32>,
    capacity_history: Vec<CapacityHistoryEntry>,
    battery_name: String,
    manufacturer: String,
    chemistry: String,
}

fn parse_battery_html(html: &str) -> ParsedBatteryReport {
    let mut report = ParsedBatteryReport {
        design_capacity_mwh: 0,
        full_charge_capacity_mwh: 0,
        cycle_count: None,
        capacity_history: Vec::new(),
        battery_name: String::new(),
        manufacturer: String::new(),
        chemistry: String::new(),
    };

    let lines: Vec<&str> = html.lines().collect();

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        // Look for DESIGN CAPACITY
        if trimmed.contains("DESIGN CAPACITY") || trimmed.contains("Design Capacity") {
            if let Some(next) = lines.get(i + 1) {
                if let Some(val) = extract_mwh(next) {
                    report.design_capacity_mwh = val;
                }
            }
            // Also check same line for table format
            if let Some(val) = extract_mwh(trimmed) {
                report.design_capacity_mwh = val;
            }
        }

        // FULL CHARGE CAPACITY
        if trimmed.contains("FULL CHARGE CAPACITY") || trimmed.contains("Full Charge Capacity") {
            if let Some(next) = lines.get(i + 1) {
                if let Some(val) = extract_mwh(next) {
                    report.full_charge_capacity_mwh = val;
                }
            }
            if let Some(val) = extract_mwh(trimmed) {
                report.full_charge_capacity_mwh = val;
            }
        }

        // CYCLE COUNT
        if trimmed.contains("CYCLE COUNT") || trimmed.contains("Cycle Count") {
            if let Some(next) = lines.get(i + 1) {
                let text = strip_html_tags(next);
                if let Ok(val) = text.trim().parse::<u32>() {
                    report.cycle_count = Some(val);
                }
            }
            let text = strip_html_tags(trimmed);
            // Try to find number after "Cycle Count"
            if let Some(pos) = text.find("Count") {
                let after = &text[pos + 5..];
                let num_str: String = after.chars().filter(|c| c.is_ascii_digit()).collect();
                if let Ok(val) = num_str.parse::<u32>() {
                    report.cycle_count = Some(val);
                }
            }
        }

        // NAME
        if (trimmed.contains(">NAME<") || trimmed.contains(">Name<"))
            && report.battery_name.is_empty()
        {
            if let Some(next) = lines.get(i + 1) {
                let text = strip_html_tags(next).trim().to_string();
                if !text.is_empty() {
                    report.battery_name = text;
                }
            }
        }

        // MANUFACTURER
        if trimmed.contains("MANUFACTURER") || trimmed.contains("Manufacturer") {
            if report.manufacturer.is_empty() {
                if let Some(next) = lines.get(i + 1) {
                    let text = strip_html_tags(next).trim().to_string();
                    if !text.is_empty() && !text.contains("MANUFACTURER") {
                        report.manufacturer = text;
                    }
                }
            }
        }

        // CHEMISTRY
        if trimmed.contains("CHEMISTRY") || trimmed.contains("Chemistry") {
            if report.chemistry.is_empty() {
                if let Some(next) = lines.get(i + 1) {
                    let text = strip_html_tags(next).trim().to_string();
                    if !text.is_empty() && !text.contains("CHEMISTRY") {
                        report.chemistry = text;
                    }
                }
            }
        }

        // Capacity history table rows (date, full charge, design capacity)
        // Format: <td>YYYY-MM-DD</td><td>XX,XXX mWh</td><td>XX,XXX mWh</td>
        if trimmed.contains("Battery capacity history") || trimmed.contains("Capacity History") {
            // Parse subsequent table rows
            for j in (i + 1)..lines.len().min(i + 500) {
                let row = lines[j].trim();
                if row.contains("</table>") {
                    break;
                }
                // Look for rows with date pattern
                if row.contains("<td>") {
                    let cells: Vec<String> = row
                        .split("<td>")
                        .skip(1)
                        .map(|c| strip_html_tags(&format!("<td>{}", c)))
                        .collect();

                    if cells.len() >= 3 {
                        let date = cells[0].trim().to_string();
                        // Validate date-like format
                        if date.len() >= 8 && date.contains('-') {
                            let fc = extract_mwh_from_text(&cells[1]).unwrap_or(0);
                            let dc = extract_mwh_from_text(&cells[2]).unwrap_or(0);
                            if fc > 0 || dc > 0 {
                                report.capacity_history.push(CapacityHistoryEntry {
                                    date,
                                    full_charge_capacity_mwh: fc,
                                    design_capacity_mwh: dc,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    report
}

fn extract_mwh(s: &str) -> Option<u64> {
    let text = strip_html_tags(s);
    extract_mwh_from_text(&text)
}

fn extract_mwh_from_text(text: &str) -> Option<u64> {
    // Look for patterns like "41,440 mWh" or "41440 mWh" or just numbers
    let cleaned: String = text.replace(",", "").replace(" ", "");
    // Find "XXXXmWh" or just digits
    if let Some(pos) = cleaned.to_lowercase().find("mwh") {
        let num_part = &cleaned[..pos];
        let num_str: String = num_part.chars().filter(|c| c.is_ascii_digit()).collect();
        num_str.parse::<u64>().ok()
    } else {
        // Just try to parse any number
        let num_str: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
        if !num_str.is_empty() {
            num_str.parse::<u64>().ok()
        } else {
            None
        }
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
