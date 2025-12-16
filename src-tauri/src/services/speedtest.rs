//! Speedtest Service
//!
//! Runs the Ookla Speedtest CLI to measure network bandwidth.
//! Reports download/upload speeds, ping, and overall quality rating.

use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::commands::get_program_exe_path;
use crate::services::Service;
use crate::types::{FindingSeverity, ServiceDefinition, ServiceFinding, ServiceResult};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct SpeedtestService;

impl Service for SpeedtestService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "speedtest".to_string(),
            name: "Network Speed Test".to_string(),
            description: "Measures internet bandwidth using Speedtest.net".to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 45,
            required_programs: vec!["speedtest".to_string()],
            options: vec![],
            icon: "download".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let mut success = true;
        let mut error: Option<String> = None;
        let service_id = "speedtest";

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

        emit_log("Starting network speed test...", &mut logs, app);

        // Get executable path
        let exe_path = match get_program_exe_path("speedtest".to_string()) {
            Ok(Some(path)) => path,
            Ok(None) => {
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some("Speedtest CLI executable not found".to_string()),
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

        emit_log(&format!("Using speedtest: {}", exe_path), &mut logs, app);
        emit_log("Selecting best server...", &mut logs, app);

        // Run speedtest with JSON output and accept license
        let output = Command::new(&exe_path)
            .args(["--accept-license", "--accept-gdpr", "--format=json"])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                if !stderr.is_empty() {
                    emit_log(&format!("stderr: {}", stderr.trim()), &mut logs, app);
                }

                match serde_json::from_str::<SpeedtestResult>(&stdout) {
                    Ok(result) => {
                        let download_mbps = result
                            .download
                            .as_ref()
                            .map(|d| d.bandwidth as f64 * 8.0 / 1_000_000.0);
                        let upload_mbps = result
                            .upload
                            .as_ref()
                            .map(|u| u.bandwidth as f64 * 8.0 / 1_000_000.0);
                        let ping_ms = result.ping.as_ref().map(|p| p.latency);
                        let jitter_ms = result.ping.as_ref().and_then(|p| p.jitter);

                        let server_name = result
                            .server
                            .as_ref()
                            .map(|s| format!("{} ({})", s.name, s.location))
                            .unwrap_or_else(|| "Unknown Server".to_string());

                        let isp = result
                            .isp
                            .clone()
                            .unwrap_or_else(|| "Unknown ISP".to_string());

                        emit_log(&format!("Server: {}", server_name), &mut logs, app);
                        emit_log(&format!("ISP: {}", isp), &mut logs, app);

                        if let Some(dl) = download_mbps {
                            emit_log(&format!("Download: {:.2} Mbps", dl), &mut logs, app);
                        }
                        if let Some(ul) = upload_mbps {
                            emit_log(&format!("Upload: {:.2} Mbps", ul), &mut logs, app);
                        }
                        if let Some(ping) = ping_ms {
                            emit_log(&format!("Ping: {:.1} ms", ping), &mut logs, app);
                        }

                        // Calculate score and rating
                        let (score, rating, verdict) =
                            calculate_rating(download_mbps, upload_mbps, ping_ms);

                        emit_log(
                            &format!("Rating: {} ({}/5 stars)", verdict, rating),
                            &mut logs,
                            app,
                        );

                        // Determine severity
                        let severity = match rating {
                            5 => FindingSeverity::Success,
                            4 => FindingSeverity::Success,
                            3 => FindingSeverity::Info,
                            2 => FindingSeverity::Warning,
                            _ => FindingSeverity::Error,
                        };

                        findings.push(ServiceFinding {
                            severity,
                            title: format!("Speed Test: {}", verdict),
                            description: format!(
                                "Download: {:.2} Mbps, Upload: {:.2} Mbps, Ping: {:.1} ms",
                                download_mbps.unwrap_or(0.0),
                                upload_mbps.unwrap_or(0.0),
                                ping_ms.unwrap_or(0.0)
                            ),
                            recommendation: get_speed_recommendation(rating),
                            data: Some(json!({
                                "type": "speedtest_result",
                                "downloadMbps": download_mbps,
                                "uploadMbps": upload_mbps,
                                "pingMs": ping_ms,
                                "jitterMs": jitter_ms,
                                "server": server_name,
                                "isp": isp,
                                "score": score,
                                "rating": rating,
                                "verdict": verdict,
                                "resultUrl": result.result.as_ref().map(|r| &r.url),
                            })),
                        });
                    }
                    Err(e) => {
                        success = false;
                        error = Some(format!("Failed to parse speedtest output: {}", e));
                        emit_log(&format!("Error parsing output: {}", e), &mut logs, app);
                        emit_log(&format!("Raw output: {}", stdout), &mut logs, app);
                    }
                }
            }
            Err(e) => {
                success = false;
                error = Some(format!("Failed to execute speedtest: {}", e));
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
struct SpeedtestResult {
    download: Option<BandwidthData>,
    upload: Option<BandwidthData>,
    ping: Option<PingData>,
    server: Option<ServerData>,
    isp: Option<String>,
    result: Option<ResultData>,
}

#[derive(Debug, Deserialize)]
struct BandwidthData {
    bandwidth: u64, // bytes per second
}

#[derive(Debug, Deserialize)]
struct PingData {
    latency: f64,
    jitter: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ServerData {
    name: String,
    location: String,
}

#[derive(Debug, Deserialize)]
struct ResultData {
    url: String,
}

// =============================================================================
// Rating Calculation
// =============================================================================

fn calculate_rating(
    download_mbps: Option<f64>,
    upload_mbps: Option<f64>,
    ping_ms: Option<f64>,
) -> (f64, u8, String) {
    let mut score: f64 = 100.0;
    let mut notes: Vec<&str> = Vec::new();

    // Ping scoring
    if let Some(ping) = ping_ms {
        if ping > 100.0 {
            score -= 20.0;
            notes.push("high ping");
        } else if ping > 50.0 {
            score -= 10.0;
        }
    }

    // Download scoring
    if let Some(dl) = download_mbps {
        if dl < 10.0 {
            score -= 40.0;
            notes.push("slow download");
        } else if dl < 25.0 {
            score -= 20.0;
        } else if dl < 50.0 {
            score -= 10.0;
        }
    }

    // Upload scoring
    if let Some(ul) = upload_mbps {
        if ul < 5.0 {
            score -= 25.0;
            notes.push("slow upload");
        } else if ul < 10.0 {
            score -= 10.0;
        }
    }

    score = score.clamp(0.0, 100.0);

    let rating = match score as u32 {
        85..=100 => 5,
        70..=84 => 4,
        50..=69 => 3,
        30..=49 => 2,
        _ => 1,
    };

    let verdict = match rating {
        5 => "Excellent",
        4 => "Good",
        3 => "Fair",
        2 => "Poor",
        _ => "Very Poor",
    };

    (score, rating, verdict.to_string())
}

fn get_speed_recommendation(rating: u8) -> Option<String> {
    match rating {
        1..=2 => Some("Internet speed is below recommended levels. Consider checking your connection or contacting your ISP.".to_string()),
        3 => Some("Internet speed is acceptable but could be improved for optimal performance.".to_string()),
        _ => None,
    }
}
