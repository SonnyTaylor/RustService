//! iPerf3 Network Stability Test Service
//!
//! Runs iperf3 client against a configured server to assess network
//! throughput stability over time. Supports TCP/UDP, configurable duration,
//! and provides detailed statistics.

use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::commands::get_program_exe_path;
use crate::services::Service;
use crate::types::{
    FindingSeverity, ServiceDefinition, ServiceFinding, ServiceOptionSchema, ServiceResult,
};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct IperfService;

impl Service for IperfService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "iperf".to_string(),
            name: "Network Stability Test".to_string(),
            description: "Tests network stability and throughput using iPerf3".to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 120,
            required_programs: vec!["iperf3".to_string()],
            options: vec![
                ServiceOptionSchema {
                    id: "server".to_string(),
                    label: "Server Address".to_string(),
                    option_type: "string".to_string(),
                    default_value: json!("iperf.he.net"),
                    min: None,
                    max: None,
                    options: None,
                    description: Some("iPerf3 server hostname or IP".to_string()),
                },
                ServiceOptionSchema {
                    id: "duration".to_string(),
                    label: "Duration (seconds)".to_string(),
                    option_type: "number".to_string(),
                    default_value: json!(30),
                    min: Some(5.0),
                    max: Some(300.0),
                    options: None,
                    description: Some("Test duration in seconds".to_string()),
                },
                ServiceOptionSchema {
                    id: "reverse".to_string(),
                    label: "Download Test".to_string(),
                    option_type: "boolean".to_string(),
                    default_value: json!(true),
                    min: None,
                    max: None,
                    options: None,
                    description: Some(
                        "If enabled, tests download speed (server to client)".to_string(),
                    ),
                },
            ],
            icon: "network".to_string(),
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let mut success = true;
        let mut error: Option<String> = None;
        let service_id = "iperf";

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

        // Parse options
        let server = options
            .get("server")
            .and_then(|v| v.as_str())
            .unwrap_or("iperf.he.net");
        let duration = options
            .get("duration")
            .and_then(|v| v.as_u64())
            .unwrap_or(30) as u32;
        let reverse = options
            .get("reverse")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        emit_log("Starting network stability test...", &mut logs, app);
        emit_log(&format!("Server: {}", server), &mut logs, app);
        emit_log(&format!("Duration: {} seconds", duration), &mut logs, app);
        emit_log(
            &format!("Direction: {}", if reverse { "Download" } else { "Upload" }),
            &mut logs,
            app,
        );

        // Get executable path
        let exe_path = match get_program_exe_path("iperf3".to_string()) {
            Ok(Some(path)) => path,
            Ok(None) => {
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("iPerf3 executable not found".to_string()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings: vec![],
                    logs,
                };
            }
            Err(e) => {
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(format!("Failed to get executable path: {}", e)),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings: vec![],
                    logs,
                };
            }
        };

        emit_log(&format!("Using iperf3: {}", exe_path), &mut logs, app);
        emit_log("Connecting to server...", &mut logs, app);

        // Build command
        let mut args = vec![
            "-c".to_string(),
            server.to_string(),
            "-t".to_string(),
            duration.to_string(),
            "-i".to_string(),
            "1".to_string(), // 1-second intervals
            "--json".to_string(),
        ];

        if reverse {
            args.push("-R".to_string());
        }

        let output = Command::new(&exe_path).args(&args).output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                if !stderr.is_empty() {
                    emit_log(&format!("stderr: {}", stderr.trim()), &mut logs, app);
                }

                match serde_json::from_str::<IperfResult>(&stdout) {
                    Ok(result) => {
                        // Check for iperf error
                        if let Some(err) = &result.error {
                            success = false;
                            error = Some(err.clone());
                            emit_log(&format!("iPerf error: {}", err), &mut logs, app);
                        } else {
                            // Extract interval data for throughput over time
                            let throughput_mbps: Vec<f64> = result
                                .intervals
                                .iter()
                                .filter_map(|i| i.sum.as_ref())
                                .map(|s| s.bits_per_second / 1_000_000.0)
                                .collect();

                            // Calculate statistics
                            let stats = calculate_stats(&throughput_mbps);

                            emit_log(
                                &format!(
                                    "Test complete. {} samples collected.",
                                    throughput_mbps.len()
                                ),
                                &mut logs,
                                app,
                            );
                            emit_log(
                                &format!(
                                    "Mean: {:.2} Mbps, Median: {:.2} Mbps",
                                    stats.mean, stats.median
                                ),
                                &mut logs,
                                app,
                            );
                            emit_log(
                                &format!("Range: {:.2} - {:.2} Mbps", stats.min, stats.max),
                                &mut logs,
                                app,
                            );
                            emit_log(
                                &format!("Variability (CoV): {:.1}%", stats.cov * 100.0),
                                &mut logs,
                                app,
                            );

                            // Get aggregates from end section
                            let retransmits = result
                                .end
                                .as_ref()
                                .and_then(|e| e.sum_sent.as_ref())
                                .and_then(|s| s.retransmits);

                            // Calculate stability score
                            let (score, verdict) = calculate_stability_score(&stats, retransmits);

                            emit_log(
                                &format!("Stability Score: {:.0}/100 ({})", score, verdict),
                                &mut logs,
                                app,
                            );

                            // Determine severity
                            let severity = match score as u32 {
                                85..=100 => FindingSeverity::Success,
                                70..=84 => FindingSeverity::Success,
                                50..=69 => FindingSeverity::Info,
                                30..=49 => FindingSeverity::Warning,
                                _ => FindingSeverity::Error,
                            };

                            findings.push(ServiceFinding {
                                severity,
                                title: format!("Network Stability: {}", verdict),
                                description: format!(
                                    "{} test: Mean {:.2} Mbps (range {:.2}-{:.2}), {:.1}% variability",
                                    if reverse { "Download" } else { "Upload" },
                                    stats.mean,
                                    stats.min,
                                    stats.max,
                                    stats.cov * 100.0
                                ),
                                recommendation: get_stability_recommendation(score),
                                data: Some(json!({
                                    "type": "iperf_result",
                                    "server": server,
                                    "direction": if reverse { "download" } else { "upload" },
                                    "durationSeconds": duration,
                                    "throughputMbps": throughput_mbps,
                                    "stats": {
                                        "mean": stats.mean,
                                        "median": stats.median,
                                        "min": stats.min,
                                        "max": stats.max,
                                        "stdev": stats.stdev,
                                        "cov": stats.cov,
                                        "p10": stats.p10,
                                        "p90": stats.p90,
                                        "samples": stats.samples,
                                    },
                                    "retransmits": retransmits,
                                    "score": score,
                                    "verdict": verdict,
                                })),
                            });
                        }
                    }
                    Err(e) => {
                        success = false;
                        error = Some(format!("Failed to parse iperf output: {}", e));
                        emit_log(&format!("Error parsing output: {}", e), &mut logs, app);
                        // Log partial output for debugging
                        if stdout.len() > 500 {
                            emit_log(
                                &format!("Output (truncated): {}...", &stdout[..500]),
                                &mut logs,
                                app,
                            );
                        } else {
                            emit_log(&format!("Output: {}", stdout), &mut logs, app);
                        }
                    }
                }
            }
            Err(e) => {
                success = false;
                error = Some(format!("Failed to execute iperf3: {}", e));
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

// =============================================================================
// Data Structures
// =============================================================================

#[derive(Debug, Deserialize)]
struct IperfResult {
    error: Option<String>,
    intervals: Vec<Interval>,
    end: Option<EndSection>,
}

#[derive(Debug, Deserialize)]
struct Interval {
    sum: Option<IntervalSum>,
}

#[derive(Debug, Deserialize)]
struct IntervalSum {
    bits_per_second: f64,
}

#[derive(Debug, Deserialize)]
struct EndSection {
    sum_sent: Option<SumSent>,
}

#[derive(Debug, Deserialize)]
struct SumSent {
    retransmits: Option<u64>,
}

// =============================================================================
// Statistics Calculation
// =============================================================================

struct ThroughputStats {
    samples: usize,
    mean: f64,
    median: f64,
    min: f64,
    max: f64,
    stdev: f64,
    cov: f64,
    p10: f64,
    p90: f64,
}

fn calculate_stats(values: &[f64]) -> ThroughputStats {
    if values.is_empty() {
        return ThroughputStats {
            samples: 0,
            mean: 0.0,
            median: 0.0,
            min: 0.0,
            max: 0.0,
            stdev: 0.0,
            cov: 0.0,
            p10: 0.0,
            p90: 0.0,
        };
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let n = sorted.len();
    let sum: f64 = sorted.iter().sum();
    let mean = sum / n as f64;

    let median = if n % 2 == 0 {
        (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
    } else {
        sorted[n / 2]
    };

    let min = sorted[0];
    let max = sorted[n - 1];

    let variance: f64 = sorted.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n as f64;
    let stdev = variance.sqrt();
    let cov = if mean > 0.0 { stdev / mean } else { 0.0 };

    let p10 = percentile(&sorted, 0.1);
    let p90 = percentile(&sorted, 0.9);

    ThroughputStats {
        samples: n,
        mean,
        median,
        min,
        max,
        stdev,
        cov,
        p10,
        p90,
    }
}

fn percentile(sorted: &[f64], pct: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let k = (sorted.len() - 1) as f64 * pct;
    let f = k.floor() as usize;
    let c = (f + 1).min(sorted.len() - 1);
    if f == c {
        sorted[f]
    } else {
        sorted[f] + (sorted[c] - sorted[f]) * (k - f as f64)
    }
}

fn calculate_stability_score(stats: &ThroughputStats, retransmits: Option<u64>) -> (f64, String) {
    let mut score: f64 = 100.0;
    let mut notes: Vec<&str> = Vec::new();

    // Variability penalty (CoV)
    let cov_percent = stats.cov * 100.0;
    if cov_percent > 20.0 {
        score -= 30.0;
        notes.push("high variability");
    } else if cov_percent > 10.0 {
        score -= 15.0;
        notes.push("moderate variability");
    } else if cov_percent > 5.0 {
        score -= 5.0;
    }

    // Retransmit penalty
    if let Some(r) = retransmits {
        if r > 100 {
            score -= 25.0;
            notes.push("high retransmits");
        } else if r > 20 {
            score -= 15.0;
            notes.push("some retransmits");
        } else if r > 0 {
            score -= 5.0;
        }
    }

    // Zero throughput intervals
    let zero_count =
        stats.samples - (stats.samples as f64 * (if stats.min > 0.0 { 1.0 } else { 0.8 })) as usize;
    if zero_count > 0 {
        score -= 20.0;
        notes.push("connection drops");
    }

    score = score.clamp(0.0, 100.0);

    let verdict = match score as u32 {
        85..=100 => "Excellent",
        70..=84 => "Good",
        50..=69 => "Fair",
        30..=49 => "Poor",
        _ => "Unstable",
    };

    (score, verdict.to_string())
}

fn get_stability_recommendation(score: f64) -> Option<String> {
    match score as u32 {
        0..=49 => Some("Network connection is unstable. Check for interference, cable quality, or contact your ISP.".to_string()),
        50..=69 => Some("Network shows some instability. Consider checking router placement or connection quality.".to_string()),
        _ => None,
    }
}
