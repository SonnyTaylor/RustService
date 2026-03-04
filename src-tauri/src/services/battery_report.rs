//! Battery Report Service
//!
//! Comprehensive battery health service that combines real-time battery status
//! (via the `battery` crate) with detailed capacity history and degradation
//! analysis from Windows `powercfg /batteryreport`.

use std::process::Command;
use std::time::Instant;

use battery::units::ratio::percent;
use battery::units::time::second;
use battery::Manager;
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
            name: "Battery Health Check".to_string(),
            description:
                "Battery health, charge status, capacity history, and degradation analysis"
                    .to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 10,
            required_programs: vec![], // Built-in Windows tool + battery crate
            options: vec![],
            icon: "battery-charging".to_string(),
            exclusive_resources: vec![],
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

        // ── Real-time battery status via battery crate ──────────────────
        emit_log("Checking battery status...", &mut logs, app);

        let mut realtime_charge: Option<f32> = None;
        let mut realtime_state: Option<String> = None;
        let mut realtime_technology: Option<String> = None;
        let mut realtime_time_to_full: Option<u64> = None;
        let mut realtime_time_to_empty: Option<u64> = None;

        match Manager::new() {
            Ok(manager) => {
                let batteries: Vec<_> = manager
                    .batteries()
                    .ok()
                    .map(|iter| iter.filter_map(|b| b.ok()).collect())
                    .unwrap_or_default();

                if batteries.is_empty() {
                    emit_log("No battery detected via system API", &mut logs, app);
                } else {
                    let bat = &batteries[0];
                    let charge = bat.state_of_charge().get::<percent>();
                    let state = format!("{:?}", bat.state());
                    let tech = format!("{:?}", bat.technology());

                    emit_log(&format!("  Charge: {:.0}% | State: {} | Tech: {}", charge, state, tech), &mut logs, app);

                    realtime_charge = Some(charge);
                    realtime_state = Some(state);
                    realtime_technology = Some(tech);
                    realtime_time_to_full = bat.time_to_full().map(|t| t.get::<second>() as u64);
                    realtime_time_to_empty = bat.time_to_empty().map(|t| t.get::<second>() as u64);
                }
            }
            Err(e) => {
                emit_log(&format!("Could not read real-time battery info: {}", e), &mut logs, app);
            }
        }

        // ── Detailed report via powercfg /batteryreport ────────────────
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
                    agent_analysis: None,
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

        // Check for no battery (powercfg says no battery AND the crate found none)
        if (stdout_str.contains("no batteries")
            || stderr_str.contains("no batteries")
            || stdout_str.contains("Unable to perform operation"))
            && realtime_charge.is_none()
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
                agent_analysis: None,
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
                    agent_analysis: None,
                };
            }
        };

        emit_log("Parsing battery report...", &mut logs, app);

        let parsed = parse_battery_html(&html_content);

        // Calculate health percentage
        let health_percent =
            if parsed.design_capacity_mwh > 0 && parsed.full_charge_capacity_mwh > 0 {
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
                format!(
                    "Battery Health: {:.1}% — Replace Recommended",
                    health_percent
                ),
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
            Some("Battery has significantly degraded. Consider replacing the battery.".to_string())
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
                "chargePercent": realtime_charge,
                "state": realtime_state,
                "technology": realtime_technology,
                "timeToFullSecs": realtime_time_to_full,
                "timeToEmptySecs": realtime_time_to_empty,
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
            agent_analysis: None,
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

    // Normalize the HTML: join all lines into one string, then split by table rows.
    // powercfg /batteryreport output wraps lines at ~80 columns, which can split
    // fields like "FULL CHARGE CAPACITY" across two lines. Normalizing first avoids
    // all line-boundary parsing issues.
    let normalized = html.lines().map(|l| l.trim()).collect::<Vec<_>>().join(" ");

    // --- Parse the "Installed batteries" table for battery metadata ---
    // The table has rows like:
    //   <span class="label">DESIGN CAPACITY</span></td><td>84,000 mWh</td>
    // Split by </tr> to get individual rows, then extract label-value pairs.
    if let Some(battery_section_start) = normalized.find("Installed batteries") {
        let section = &normalized[battery_section_start..];
        // Find the end of this table
        let section_end = section.find("</table>").unwrap_or(section.len());
        let battery_table = &section[..section_end];

        // Split into rows
        for row in battery_table.split("</tr>") {
            // Extract cells from each row
            let cells: Vec<String> = row
                .split("</td>")
                .map(|c| strip_html_tags(c))
                .map(|c| c.trim().to_string())
                .filter(|c| !c.is_empty())
                .collect();

            if cells.len() >= 2 {
                let label = cells[0].to_uppercase();
                let value = &cells[1];

                if label.contains("DESIGN CAPACITY") && report.design_capacity_mwh == 0 {
                    if let Some(val) = extract_mwh_from_text(value) {
                        report.design_capacity_mwh = val;
                    }
                } else if (label.contains("FULL CHARGE CAPACITY")
                    || label.contains("LAST FULL CHARGE"))
                    && report.full_charge_capacity_mwh == 0
                {
                    if let Some(val) = extract_mwh_from_text(value) {
                        report.full_charge_capacity_mwh = val;
                    }
                } else if label.contains("CYCLE COUNT") && report.cycle_count.is_none() {
                    let num_str: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
                    if let Ok(val) = num_str.parse::<u32>() {
                        report.cycle_count = Some(val);
                    }
                } else if label == "NAME" && report.battery_name.is_empty() {
                    report.battery_name = value.to_string();
                } else if label.contains("MANUFACTURER")
                    && report.manufacturer.is_empty()
                    && !label.contains("SYSTEM")
                {
                    report.manufacturer = value.to_string();
                } else if label.contains("CHEMISTRY") && report.chemistry.is_empty() {
                    report.chemistry = value.to_string();
                }
            }
        }
    }

    // --- Parse "Battery capacity history" table ---
    // Rows contain: date | full charge capacity | design capacity
    if let Some(history_start) = normalized.find("Battery capacity history") {
        let section = &normalized[history_start..];
        let section_end = section.find("</table>").unwrap_or(section.len());
        let history_table = &section[..section_end];

        for row in history_table.split("</tr>") {
            // Skip header rows
            if row.contains("<th") || row.contains("thead") {
                continue;
            }
            // Extract cells
            let cells: Vec<String> = row
                .split("</td>")
                .map(|c| strip_html_tags(c))
                .map(|c| c.trim().to_string())
                .filter(|c| !c.is_empty())
                .collect();

            // Need at least 3 cells: date, full charge, design
            if cells.len() >= 3 {
                // Find the date cell (contains a dash and is date-like)
                let date = cells[0].trim().to_string();
                if date.len() >= 8 && date.contains('-') {
                    // The mWh values may be in cells[1] and cells[2], or possibly
                    // offset if there are extra columns. Find the two mWh values.
                    let mut mwh_values: Vec<u64> = Vec::new();
                    for cell in &cells[1..] {
                        if let Some(val) = extract_mwh_from_text(cell) {
                            mwh_values.push(val);
                        }
                    }
                    if mwh_values.len() >= 2 {
                        report.capacity_history.push(CapacityHistoryEntry {
                            date,
                            full_charge_capacity_mwh: mwh_values[0],
                            design_capacity_mwh: mwh_values[1],
                        });
                    }
                }
            }
        }
    }

    report
}

fn extract_mwh_from_text(text: &str) -> Option<u64> {
    // Look for patterns like "41,440 mWh" or "41440 mWh"
    let cleaned: String = text.replace(",", "").replace(" ", "");
    if let Some(pos) = cleaned.to_lowercase().find("mwh") {
        // Walk backwards from the "mwh" position to find the start of the number
        let num_part = &cleaned[..pos];
        let num_str: String = num_part
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_digit())
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        if !num_str.is_empty() {
            return num_str.parse::<u64>().ok();
        }
    }
    None
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
