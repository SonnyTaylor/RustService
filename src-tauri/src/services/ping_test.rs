//! Ping Test Service
//!
//! Tests network connectivity by pinging specified hosts.

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

pub struct PingTestService;

impl Service for PingTestService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "ping-test".to_string(),
            name: "Ping Test".to_string(),
            description: "Tests network connectivity by pinging specified hosts".to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 10,
            required_programs: vec![],
            options: vec![
                ServiceOptionSchema {
                    id: "target".to_string(),
                    label: "Target Host".to_string(),
                    option_type: "string".to_string(),
                    default_value: json!("8.8.8.8"),
                    min: None,
                    max: None,
                    options: None,
                    description: Some("IP address or hostname to ping".to_string()),
                },
                ServiceOptionSchema {
                    id: "count".to_string(),
                    label: "Ping Count".to_string(),
                    option_type: "number".to_string(),
                    default_value: json!(4),
                    min: Some(1.0),
                    max: Some(100.0),
                    options: None,
                    description: Some("Number of ping requests to send".to_string()),
                },
            ],
            icon: "wifi".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let mut success = true;
        let mut error: Option<String> = None;

        let service_id = "ping-test";

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

        let target = options
            .get("target")
            .and_then(|v| v.as_str())
            .unwrap_or("8.8.8.8");
        let count = options.get("count").and_then(|v| v.as_u64()).unwrap_or(4) as u32;

        emit_log(
            &format!("Starting ping test to {} ({} pings)", target, count),
            &mut logs,
            app,
        );

        // Run Windows ping command
        let output = Command::new("ping")
            .args(["-n", &count.to_string(), target])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                // Log each line
                for line in stdout.lines() {
                    if !line.trim().is_empty() {
                        emit_log(line, &mut logs, app);
                    }
                }

                if !stderr.is_empty() {
                    emit_log(&format!("Error: {}", stderr), &mut logs, app);
                }

                // Parse results
                let mut avg_latency: Option<f64> = None;
                let mut packet_loss: Option<u32> = None;

                // Parse average latency from "Average = XXms"
                if let Some(avg_line) = stdout.lines().find(|l| l.contains("Average")) {
                    if let Some(avg_str) = avg_line.split('=').last() {
                        let cleaned = avg_str.trim().replace("ms", "");
                        avg_latency = cleaned.parse().ok();
                    }
                }

                // Parse packet loss from "(X% loss)" or "Lost = X"
                if let Some(loss_line) = stdout.lines().find(|l| l.contains("Lost")) {
                    if let Some(lost_part) = loss_line.split("Lost").nth(1) {
                        if let Some(num) = lost_part
                            .chars()
                            .filter(|c| c.is_ascii_digit())
                            .collect::<String>()
                            .parse::<u32>()
                            .ok()
                        {
                            packet_loss = Some((num * 100) / count);
                        }
                    }
                }

                // Generate findings
                if output.status.success() {
                    if let Some(avg) = avg_latency {
                        let severity = if avg < 50.0 {
                            FindingSeverity::Success
                        } else if avg < 100.0 {
                            FindingSeverity::Info
                        } else if avg < 200.0 {
                            FindingSeverity::Warning
                        } else {
                            FindingSeverity::Error
                        };

                        findings.push(ServiceFinding {
                            severity,
                            title: format!("Average Latency: {:.0}ms", avg),
                            description: format!(
                                "Ping to {} completed with average latency of {:.0}ms",
                                target, avg
                            ),
                            recommendation: if avg > 100.0 {
                                Some("High latency detected. Check network connection.".to_string())
                            } else {
                                None
                            },
                            data: Some(json!({
                                "avgLatency": avg,
                                "target": target,
                                "type": "latency"
                            })),
                        });
                    }

                    if let Some(loss) = packet_loss {
                        let severity = if loss == 0 {
                            FindingSeverity::Success
                        } else if loss < 10 {
                            FindingSeverity::Warning
                        } else {
                            FindingSeverity::Error
                        };

                        findings.push(ServiceFinding {
                            severity,
                            title: format!("Packet Loss: {}%", loss),
                            description: format!(
                                "{} out of {} packets lost",
                                (loss * count) / 100,
                                count
                            ),
                            recommendation: if loss > 0 {
                                Some("Packet loss detected. Network may be unstable.".to_string())
                            } else {
                                None
                            },
                            data: Some(json!({
                                "packetLoss": loss,
                                "type": "packet_loss"
                            })),
                        });
                    }

                    emit_log("Ping test completed successfully", &mut logs, app);
                } else {
                    success = false;
                    error = Some("Ping command failed".to_string());
                    findings.push(ServiceFinding {
                        severity: FindingSeverity::Error,
                        title: "Ping Failed".to_string(),
                        description: format!("Unable to reach {}", target),
                        recommendation: Some(
                            "Check network connection and ensure host is reachable.".to_string(),
                        ),
                        data: None,
                    });
                }
            }
            Err(e) => {
                success = false;
                error = Some(format!("Failed to execute ping command: {}", e));
                emit_log(&format!("Error: {}", e), &mut logs, app);
            }
        }

        ServiceResult {
            service_id: service_id.to_string(),
            success,
            error,
            duration_ms: start.elapsed().as_millis() as u64,
            findings,
            logs,
        }
    }
}
