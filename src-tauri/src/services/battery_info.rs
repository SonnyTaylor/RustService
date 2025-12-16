//! Battery Info Service
//!
//! Retrieves battery health and status information.

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

pub struct BatteryInfoService;

impl Service for BatteryInfoService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "battery-info".to_string(),
            name: "Battery Health Check".to_string(),
            description: "Analyzes battery health, capacity, and status".to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 5,
            required_programs: vec![],
            options: vec![],
            icon: "battery-full".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "battery-info";

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

        emit_log("Checking for battery...", &mut logs, app);

        let manager = Manager::new();

        match manager {
            Ok(manager) => {
                let batteries: Vec<_> = manager
                    .batteries()
                    .ok()
                    .map(|iter| iter.filter_map(|b| b.ok()).collect())
                    .unwrap_or_default();

                if batteries.is_empty() {
                    emit_log(
                        "No battery detected - this appears to be a desktop system",
                        &mut logs,
                        app,
                    );

                    findings.push(ServiceFinding {
                        severity: FindingSeverity::Info,
                        title: "No Battery Detected".to_string(),
                        description: "This system does not have a battery. This is normal for desktop computers.".to_string(),
                        recommendation: None,
                        data: Some(json!({
                            "type": "no_battery",
                        })),
                    });
                } else {
                    for (index, battery) in batteries.iter().enumerate() {
                        let battery_num = index + 1;
                        emit_log(
                            &format!("Analyzing battery {}...", battery_num),
                            &mut logs,
                            app,
                        );

                        // Get battery metrics
                        let charge_percent = battery.state_of_charge().get::<percent>();
                        let health_percent = battery.state_of_health().get::<percent>();
                        let state = format!("{:?}", battery.state());
                        let technology = format!("{:?}", battery.technology());
                        let cycle_count = battery.cycle_count();

                        // Time estimates
                        let time_to_full = battery.time_to_full().map(|t| t.get::<second>() as u64);
                        let time_to_empty =
                            battery.time_to_empty().map(|t| t.get::<second>() as u64);

                        // Vendor info
                        let vendor = battery.vendor().map(|s| s.to_string());
                        let model = battery.model().map(|s| s.to_string());

                        emit_log(
                            &format!("  State of Charge: {:.1}%", charge_percent),
                            &mut logs,
                            app,
                        );
                        emit_log(
                            &format!("  State of Health: {:.1}%", health_percent),
                            &mut logs,
                            app,
                        );
                        emit_log(&format!("  State: {}", state), &mut logs, app);
                        emit_log(&format!("  Technology: {}", technology), &mut logs, app);
                        if let Some(cycles) = cycle_count {
                            emit_log(&format!("  Cycle Count: {}", cycles), &mut logs, app);
                        }

                        // Determine health severity
                        let health_severity = if health_percent >= 80.0 {
                            FindingSeverity::Success
                        } else if health_percent >= 60.0 {
                            FindingSeverity::Warning
                        } else if health_percent >= 40.0 {
                            FindingSeverity::Error
                        } else {
                            FindingSeverity::Critical
                        };

                        // Health status label
                        let health_status = if health_percent >= 80.0 {
                            "Good"
                        } else if health_percent >= 60.0 {
                            "Fair"
                        } else if health_percent >= 40.0 {
                            "Poor"
                        } else {
                            "Replace Soon"
                        };

                        // Main battery finding with all data
                        let title = if batteries.len() > 1 {
                            format!(
                                "Battery {} - {}% Health",
                                battery_num, health_percent as u32
                            )
                        } else {
                            format!("Battery Health: {:.0}%", health_percent)
                        };

                        findings.push(ServiceFinding {
                            severity: health_severity,
                            title,
                            description: format!(
                                "Currently at {:.0}% charge. Battery health is {}.",
                                charge_percent, health_status
                            ),
                            recommendation: if health_percent < 60.0 {
                                Some(
                                    "Battery capacity is degraded. Consider replacing the battery."
                                        .to_string(),
                                )
                            } else if health_percent < 80.0 {
                                Some(
                                    "Battery showing some wear. Monitor for further degradation."
                                        .to_string(),
                                )
                            } else {
                                None
                            },
                            data: Some(json!({
                                "type": "battery_status",
                                "batteryIndex": index,
                                "chargePercent": charge_percent,
                                "healthPercent": health_percent,
                                "healthStatus": health_status,
                                "state": state,
                                "technology": technology,
                                "cycleCount": cycle_count,
                                "timeToFullSecs": time_to_full,
                                "timeToEmptySecs": time_to_empty,
                                "vendor": vendor,
                                "model": model,
                            })),
                        });

                        // Add cycle count finding if available
                        if let Some(cycles) = cycle_count {
                            let cycle_severity = if cycles < 300 {
                                FindingSeverity::Success
                            } else if cycles < 500 {
                                FindingSeverity::Info
                            } else if cycles < 800 {
                                FindingSeverity::Warning
                            } else {
                                FindingSeverity::Error
                            };

                            findings.push(ServiceFinding {
                                severity: cycle_severity,
                                title: format!("Cycle Count: {}", cycles),
                                description: format!(
                                    "Battery has been through {} charge cycles. {}",
                                    cycles,
                                    if cycles < 300 {
                                        "Low usage."
                                    } else if cycles < 500 {
                                        "Normal usage."
                                    } else {
                                        "High usage - monitor battery health."
                                    }
                                ),
                                recommendation: None,
                                data: Some(json!({"type": "cycles", "value": cycles})),
                            });
                        }

                        // Add time estimate if charging/discharging
                        if let Some(secs) = time_to_full {
                            let hours = secs / 3600;
                            let mins = (secs % 3600) / 60;
                            findings.push(ServiceFinding {
                                severity: FindingSeverity::Info,
                                title: format!("Time to Full: {}h {}m", hours, mins),
                                description: "Estimated time until battery is fully charged"
                                    .to_string(),
                                recommendation: None,
                                data: Some(json!({"type": "time_to_full", "seconds": secs})),
                            });
                        }

                        if let Some(secs) = time_to_empty {
                            let hours = secs / 3600;
                            let mins = (secs % 3600) / 60;
                            let severity = if hours >= 2 {
                                FindingSeverity::Success
                            } else if hours >= 1 {
                                FindingSeverity::Info
                            } else {
                                FindingSeverity::Warning
                            };

                            findings.push(ServiceFinding {
                                severity,
                                title: format!("Battery Time Remaining: {}h {}m", hours, mins),
                                description: "Estimated time until battery is depleted".to_string(),
                                recommendation: None,
                                data: Some(json!({"type": "time_to_empty", "seconds": secs})),
                            });
                        }
                    }
                }

                emit_log("Battery check complete", &mut logs, app);
            }
            Err(e) => {
                emit_log(
                    &format!("Error accessing battery info: {}", e),
                    &mut logs,
                    app,
                );

                findings.push(ServiceFinding {
                    severity: FindingSeverity::Warning,
                    title: "Battery Information Unavailable".to_string(),
                    description: format!("Could not access battery information: {}", e),
                    recommendation: Some(
                        "This may be a desktop system or the battery driver is not responding."
                            .to_string(),
                    ),
                    data: Some(json!({"type": "error", "message": e.to_string()})),
                });
            }
        }

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
