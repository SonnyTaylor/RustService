//! WinSAT Benchmark Service
//!
//! Runs Windows System Assessment Tool (WinSAT) to benchmark disk performance.

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

pub struct WinsatService;

impl Service for WinsatService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "winsat".to_string(),
            name: "Disk Performance Benchmark".to_string(),
            description:
                "Benchmarks disk read/write performance using Windows System Assessment Tool"
                    .to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 60,
            required_programs: vec![],
            options: vec![ServiceOptionSchema {
                id: "drive".to_string(),
                label: "Drive Letter".to_string(),
                option_type: "string".to_string(),
                default_value: json!("C"),
                min: None,
                max: None,
                options: None,
                description: Some("Drive letter to benchmark (e.g., C, D)".to_string()),
            }],
            icon: "gauge".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let mut success = true;
        let mut error: Option<String> = None;
        let service_id = "winsat";

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

        let drive = options
            .get("drive")
            .and_then(|v| v.as_str())
            .unwrap_or("C")
            .chars()
            .next()
            .unwrap_or('C');

        emit_log(
            &format!("Starting WinSAT disk benchmark on drive {}:...", drive),
            &mut logs,
            app,
        );
        emit_log("This may take a minute, please wait...", &mut logs, app);

        // Run WinSAT disk benchmark
        // Using "winsat disk" which tests sequential and random read/write
        let output = Command::new("winsat")
            .args(["disk", "-drive", &drive.to_string()])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                // Log output lines (filter out empty lines)
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        emit_log(trimmed, &mut logs, app);
                    }
                }

                if !stderr.is_empty() && !stderr.trim().is_empty() {
                    emit_log(&format!("Warning: {}", stderr.trim()), &mut logs, app);
                }

                if output.status.success() {
                    // Parse WinSAT output for metrics
                    // WinSAT outputs lines like:
                    // > Disk  Sequential 64.0 Read                   520.98 MB/s
                    // > Disk  Random 16.0 Read                       280.45 MB/s

                    let mut seq_read: Option<f64> = None;
                    let mut seq_write: Option<f64> = None;
                    let mut random_read: Option<f64> = None;
                    let mut random_write: Option<f64> = None;

                    for line in stdout.lines() {
                        let line_lower = line.to_lowercase();

                        // Parse speed from lines containing MB/s
                        if line.contains("MB/s") {
                            if let Some(speed) = parse_speed_from_line(line) {
                                if line_lower.contains("sequential") && line_lower.contains("read")
                                {
                                    seq_read = Some(speed);
                                } else if line_lower.contains("sequential")
                                    && line_lower.contains("write")
                                {
                                    seq_write = Some(speed);
                                } else if line_lower.contains("random")
                                    && line_lower.contains("read")
                                {
                                    random_read = Some(speed);
                                } else if line_lower.contains("random")
                                    && line_lower.contains("write")
                                {
                                    random_write = Some(speed);
                                }
                            }
                        }
                    }

                    // Calculate overall score (average of available metrics)
                    let available_metrics: Vec<f64> =
                        [seq_read, seq_write, random_read, random_write]
                            .iter()
                            .filter_map(|&x| x)
                            .collect();

                    let avg_speed = if !available_metrics.is_empty() {
                        available_metrics.iter().sum::<f64>() / available_metrics.len() as f64
                    } else {
                        0.0
                    };

                    // Determine performance rating
                    let (rating, severity) = if avg_speed >= 400.0 {
                        ("Excellent", FindingSeverity::Success)
                    } else if avg_speed >= 200.0 {
                        ("Good", FindingSeverity::Success)
                    } else if avg_speed >= 100.0 {
                        ("Average", FindingSeverity::Info)
                    } else if avg_speed >= 50.0 {
                        ("Below Average", FindingSeverity::Warning)
                    } else if avg_speed > 0.0 {
                        ("Poor", FindingSeverity::Error)
                    } else {
                        ("Unable to measure", FindingSeverity::Warning)
                    };

                    // Main findings with chart data
                    findings.push(ServiceFinding {
                        severity: severity.clone(),
                        title: format!("Disk Performance: {}", rating),
                        description: format!(
                            "Drive {}:\\ benchmark completed. Average speed: {:.1} MB/s",
                            drive, avg_speed
                        ),
                        recommendation: if avg_speed < 100.0 && avg_speed > 0.0 {
                            Some("Consider upgrading to an SSD for better performance.".to_string())
                        } else {
                            None
                        },
                        data: Some(json!({
                            "type": "winsat_summary",
                            "drive": drive.to_string(),
                            "rating": rating,
                            "avgSpeed": avg_speed,
                            "metrics": {
                                "sequentialRead": seq_read,
                                "sequentialWrite": seq_write,
                                "randomRead": random_read,
                                "randomWrite": random_write,
                            }
                        })),
                    });

                    // Individual metric findings
                    if let Some(speed) = seq_read {
                        findings.push(ServiceFinding {
                            severity: get_speed_severity(speed),
                            title: format!("Sequential Read: {:.1} MB/s", speed),
                            description: "Large file read performance".to_string(),
                            recommendation: None,
                            data: Some(json!({"type": "metric", "name": "Sequential Read", "value": speed})),
                        });
                    }

                    if let Some(speed) = seq_write {
                        findings.push(ServiceFinding {
                            severity: get_speed_severity(speed),
                            title: format!("Sequential Write: {:.1} MB/s", speed),
                            description: "Large file write performance".to_string(),
                            recommendation: None,
                            data: Some(json!({"type": "metric", "name": "Sequential Write", "value": speed})),
                        });
                    }

                    if let Some(speed) = random_read {
                        findings.push(ServiceFinding {
                            severity: get_speed_severity(speed * 2.0), // Random is expected to be slower
                            title: format!("Random Read: {:.1} MB/s", speed),
                            description: "Small file/OS operation read performance".to_string(),
                            recommendation: None,
                            data: Some(
                                json!({"type": "metric", "name": "Random Read", "value": speed}),
                            ),
                        });
                    }

                    if let Some(speed) = random_write {
                        findings.push(ServiceFinding {
                            severity: get_speed_severity(speed * 2.0), // Random is expected to be slower
                            title: format!("Random Write: {:.1} MB/s", speed),
                            description: "Small file/OS operation write performance".to_string(),
                            recommendation: None,
                            data: Some(
                                json!({"type": "metric", "name": "Random Write", "value": speed}),
                            ),
                        });
                    }

                    emit_log("Benchmark completed successfully", &mut logs, app);
                } else {
                    success = false;
                    let error_msg = if stderr.contains("Access") || stderr.contains("administrator")
                    {
                        "WinSAT requires administrator privileges. Please run as admin."
                    } else {
                        "WinSAT benchmark failed. The drive may not support this test."
                    };
                    error = Some(error_msg.to_string());

                    findings.push(ServiceFinding {
                        severity: FindingSeverity::Error,
                        title: "Benchmark Failed".to_string(),
                        description: error_msg.to_string(),
                        recommendation: Some(
                            "Run the application as Administrator and try again.".to_string(),
                        ),
                        data: None,
                    });
                }
            }
            Err(e) => {
                success = false;
                error = Some(format!("Failed to execute WinSAT: {}", e));
                emit_log(&format!("Error: {}", e), &mut logs, app);

                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "WinSAT Not Available".to_string(),
                    description: format!("Could not run WinSAT: {}", e),
                    recommendation: Some("WinSAT is a Windows system tool. Ensure you're running on Windows 7 or later.".to_string()),
                    data: None,
                });
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

// =============================================================================
// Helper Functions
// =============================================================================

fn parse_speed_from_line(line: &str) -> Option<f64> {
    // Find the MB/s value in lines like "Disk  Sequential 64.0 Read   520.98 MB/s"
    let parts: Vec<&str> = line.split_whitespace().collect();
    for (i, part) in parts.iter().enumerate() {
        if *part == "MB/s" && i > 0 {
            if let Ok(speed) = parts[i - 1].parse::<f64>() {
                return Some(speed);
            }
        }
    }
    None
}

fn get_speed_severity(speed: f64) -> FindingSeverity {
    if speed >= 300.0 {
        FindingSeverity::Success
    } else if speed >= 150.0 {
        FindingSeverity::Info
    } else if speed >= 50.0 {
        FindingSeverity::Warning
    } else {
        FindingSeverity::Error
    }
}
