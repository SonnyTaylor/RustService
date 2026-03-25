//! USB Stability Test Service
//!
//! Non-destructive USB drive testing: sequential read/write benchmarks,
//! data integrity verification, random I/O latency, and fake-capacity detection.
//! Uses temporary files that are cleaned up after the test.

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use sysinfo::Disks;
use tauri::{AppHandle, Emitter};

use crate::services::Service;
use crate::types::{
    FindingSeverity, SelectOption, ServiceDefinition, ServiceFinding, ServiceOptionSchema,
    ServiceResult,
};

// =============================================================================
// Constants
// =============================================================================

const CHUNK_SIZE: usize = 1024 * 1024; // 1 MB chunks
const RANDOM_IO_BLOCK: usize = 4096; // 4 KB random I/O blocks
const RANDOM_IO_ITERATIONS: usize = 100;
const PATTERN_BYTE_A: u8 = 0xAA;
const PATTERN_BYTE_B: u8 = 0x55;
const TEMP_DIR_NAME: &str = "_rustservice_usb_test";

// =============================================================================
// Service Implementation
// =============================================================================

pub struct UsbStabilityService;

impl Service for UsbStabilityService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "usb-stability".to_string(),
            name: "USB Stability Test".to_string(),
            description:
                "Tests USB drive speed, integrity, and reliability with non-destructive benchmarks"
                    .to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 120,
            required_programs: vec![],
            options: vec![
                ServiceOptionSchema {
                    id: "target_drive".to_string(),
                    label: "Target USB Drive".to_string(),
                    option_type: "usb_drive".to_string(),
                    default_value: serde_json::json!(""),
                    min: None,
                    max: None,
                    options: None,
                    description: Some(
                        "Select the USB drive to test. Leave empty to auto-detect.".to_string(),
                    ),
                },
                ServiceOptionSchema {
                    id: "test_intensity".to_string(),
                    label: "Test Intensity".to_string(),
                    option_type: "select".to_string(),
                    default_value: serde_json::json!("standard"),
                    min: None,
                    max: None,
                    options: Some(vec![
                        SelectOption {
                            value: "quick".to_string(),
                            label: "Quick (256 MB)".to_string(),
                        },
                        SelectOption {
                            value: "standard".to_string(),
                            label: "Standard (512 MB)".to_string(),
                        },
                        SelectOption {
                            value: "thorough".to_string(),
                            label: "Thorough (1 GB)".to_string(),
                        },
                    ]),
                    description: Some("Amount of data to write for benchmarking".to_string()),
                },
                ServiceOptionSchema {
                    id: "verify_integrity".to_string(),
                    label: "Data Integrity Check".to_string(),
                    option_type: "boolean".to_string(),
                    default_value: serde_json::json!(true),
                    min: None,
                    max: None,
                    options: None,
                    description: Some(
                        "Verify written data byte-by-byte to detect corruption or fake drives"
                            .to_string(),
                    ),
                },
            ],
            icon: "usb".to_string(),
            exclusive_resources: vec!["disk-heavy".to_string()],
            dependencies: vec![],
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "usb-stability";

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

        emit_log("Starting USB Stability Test...", &mut logs, app);

        // Parse options
        let target_drive = options
            .get("target_drive")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let intensity = options
            .get("test_intensity")
            .and_then(|v| v.as_str())
            .unwrap_or("standard");

        let verify_integrity = options
            .get("verify_integrity")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let test_size_bytes: u64 = match intensity {
            "quick" => 256 * 1024 * 1024,
            "thorough" => 1024 * 1024 * 1024,
            _ => 512 * 1024 * 1024, // standard
        };

        let test_size_mb = test_size_bytes / (1024 * 1024);

        // =====================================================================
        // Phase 1: Drive Detection & Validation
        // =====================================================================
        emit_log("Phase 1: Detecting USB drives...", &mut logs, app);

        let disks = Disks::new_with_refreshed_list();
        let removable_drives: Vec<_> = disks
            .list()
            .iter()
            .filter(|d| d.is_removable() && d.total_space() > 0)
            .collect();

        if removable_drives.is_empty() {
            emit_log("ERROR: No removable USB drives detected!", &mut logs, app);
            findings.push(ServiceFinding {
                severity: FindingSeverity::Error,
                title: "No USB Drives Found".to_string(),
                description: "No removable USB drives were detected on this system. Please connect a USB drive and try again.".to_string(),
                recommendation: Some("Insert a USB drive and ensure it is recognized by Windows before running this test.".to_string()),
                data: Some(json!({ "type": "usb_error", "error": "no_drives" })),
            });
            return ServiceResult {
                service_id: service_id.to_string(),
                success: false,
                error: Some("No USB drives detected".to_string()),
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
                agent_analysis: None,
            };
        }

        // Select the target drive
        let selected_disk = if target_drive.is_empty() {
            emit_log(
                "No drive specified — auto-detecting first removable drive...",
                &mut logs,
                app,
            );
            removable_drives.first().copied()
        } else {
            removable_drives
                .iter()
                .find(|d| {
                    d.mount_point()
                        .to_string_lossy()
                        .trim_end_matches('\\')
                        .eq_ignore_ascii_case(target_drive.trim_end_matches('\\'))
                })
                .copied()
        };

        let selected_disk = match selected_disk {
            Some(d) => d,
            None => {
                let msg = format!(
                    "Drive '{}' not found or is not a removable USB drive",
                    target_drive
                );
                emit_log(&format!("ERROR: {}", msg), &mut logs, app);
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Error,
                    title: "Drive Not Found".to_string(),
                    description: msg.clone(),
                    recommendation: Some(
                        "Check that the USB drive is properly connected and try again.".to_string(),
                    ),
                    data: Some(json!({ "type": "usb_error", "error": "drive_not_found" })),
                });
                return ServiceResult {
                    service_id: service_id.to_string(),
                    success: false,
                    error: Some(msg),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings,
                    logs,
                    agent_analysis: None,
                };
            }
        };

        let mount_point = selected_disk.mount_point().to_string_lossy().to_string();
        let total_space = selected_disk.total_space();
        let available_space = selected_disk.available_space();
        let fs_type = selected_disk.file_system().to_string_lossy().to_string();
        let volume_name = selected_disk.name().to_string_lossy().to_string();
        let volume_label = if volume_name.is_empty() {
            "Removable Disk".to_string()
        } else {
            volume_name
        };

        emit_log(
            &format!(
                "Selected drive: {} ({}) — {:.1} GB total, {:.1} GB free, {}",
                mount_point,
                volume_label,
                total_space as f64 / 1_073_741_824.0,
                available_space as f64 / 1_073_741_824.0,
                fs_type
            ),
            &mut logs,
            app,
        );

        // Check free space
        if available_space < test_size_bytes + (10 * 1024 * 1024) {
            let msg = format!(
                "Insufficient free space on {}. Need {:.0} MB free, only {:.0} MB available.",
                mount_point,
                test_size_bytes as f64 / 1_048_576.0 + 10.0,
                available_space as f64 / 1_048_576.0
            );
            emit_log(&format!("ERROR: {}", msg), &mut logs, app);
            findings.push(ServiceFinding {
                severity: FindingSeverity::Error,
                title: "Insufficient Free Space".to_string(),
                description: msg.clone(),
                recommendation: Some(
                    "Free up space on the USB drive or use a lower test intensity.".to_string(),
                ),
                data: Some(json!({ "type": "usb_error", "error": "insufficient_space" })),
            });
            return ServiceResult {
                service_id: service_id.to_string(),
                success: false,
                error: Some(msg),
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
                agent_analysis: None,
            };
        }

        // Create temp directory
        let temp_dir = PathBuf::from(&mount_point).join(TEMP_DIR_NAME);
        let test_file = temp_dir.join("stability_test.bin");

        // Ensure cleanup on all exit paths
        let cleanup = |dir: &PathBuf, logs: &mut Vec<String>, app: &AppHandle| {
            if dir.exists() {
                match fs::remove_dir_all(dir) {
                    Ok(()) => {
                        emit_log("Cleanup: Temporary test files removed", logs, app);
                    }
                    Err(e) => {
                        emit_log(
                            &format!("Warning: Failed to clean up temp files: {}", e),
                            logs,
                            app,
                        );
                    }
                }
            }
        };

        if let Err(e) = fs::create_dir_all(&temp_dir) {
            let msg = format!("Failed to create temp directory on {}: {}", mount_point, e);
            emit_log(&format!("ERROR: {}", msg), &mut logs, app);
            return ServiceResult {
                service_id: service_id.to_string(),
                success: false,
                error: Some(msg),
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
                agent_analysis: None,
            };
        }

        // =====================================================================
        // Phase 2: Sequential Write Speed Test
        // =====================================================================
        emit_log(
            &format!("Phase 2: Sequential write test ({} MB)...", test_size_mb),
            &mut logs,
            app,
        );

        let pattern_chunk: Vec<u8> = (0..CHUNK_SIZE)
            .map(|i| {
                if i % 2 == 0 {
                    PATTERN_BYTE_A
                } else {
                    PATTERN_BYTE_B
                }
            })
            .collect();

        let total_chunks = (test_size_bytes as usize) / CHUNK_SIZE;
        let write_start = Instant::now();
        let mut bytes_written: u64 = 0;

        let write_result = (|| -> Result<(), String> {
            let mut file = fs::File::create(&test_file)
                .map_err(|e| format!("Failed to create test file: {}", e))?;

            for i in 0..total_chunks {
                file.write_all(&pattern_chunk)
                    .map_err(|e| format!("Write error at chunk {}: {}", i, e))?;
                bytes_written += CHUNK_SIZE as u64;

                // Log progress every 10%
                let progress = ((i + 1) as f64 / total_chunks as f64 * 100.0) as u32;
                if progress.is_multiple_of(10) && (i + 1) % (total_chunks / 10).max(1) == 0 {
                    emit_log(
                        &format!(
                            "  Write progress: {}% ({} MB)",
                            progress,
                            bytes_written / 1_048_576
                        ),
                        &mut logs,
                        app,
                    );
                }
            }
            file.sync_all()
                .map_err(|e| format!("Failed to sync: {}", e))?;
            Ok(())
        })();

        let write_duration = write_start.elapsed();
        let write_speed_mbps = if write_duration.as_secs_f64() > 0.0 {
            bytes_written as f64 / 1_048_576.0 / write_duration.as_secs_f64()
        } else {
            0.0
        };

        if let Err(e) = write_result {
            emit_log(&format!("ERROR: Write test failed: {}", e), &mut logs, app);
            cleanup(&temp_dir, &mut logs, app);

            findings.push(ServiceFinding {
                severity: FindingSeverity::Critical,
                title: "Write Test Failed".to_string(),
                description: e.clone(),
                recommendation: Some("The USB drive may be write-protected, corrupted, or failing. Try a different USB port or drive.".to_string()),
                data: Some(json!({ "type": "usb_error", "error": "write_failed" })),
            });
            return ServiceResult {
                service_id: service_id.to_string(),
                success: false,
                error: Some(e),
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
                agent_analysis: None,
            };
        }

        emit_log(
            &format!(
                "Write complete: {:.1} MB/s ({:.1}s for {} MB)",
                write_speed_mbps,
                write_duration.as_secs_f64(),
                test_size_mb
            ),
            &mut logs,
            app,
        );

        let SpeedRating {
            severity: write_severity,
            label: write_label,
            description: write_desc,
            recommendation: write_rec,
        } = rate_speed(write_speed_mbps, false);
        findings.push(ServiceFinding {
            severity: write_severity,
            title: format!("Sequential Write: {:.1} MB/s", write_speed_mbps),
            description: format!(
                "Wrote {} MB in {:.1} seconds. {}",
                test_size_mb,
                write_duration.as_secs_f64(),
                write_desc
            ),
            recommendation: write_rec,
            data: Some(json!({
                "type": "usb_write_speed",
                "speedMbps": write_speed_mbps,
                "bytesWritten": bytes_written,
                "durationSecs": write_duration.as_secs_f64(),
                "rating": write_label,
            })),
        });

        // =====================================================================
        // Phase 3: Sequential Read Speed Test
        // =====================================================================
        emit_log(
            &format!("Phase 3: Sequential read test ({} MB)...", test_size_mb),
            &mut logs,
            app,
        );

        let read_start = Instant::now();
        let mut bytes_read: u64 = 0;
        let mut read_buf = vec![0u8; CHUNK_SIZE];

        let read_result = (|| -> Result<(), String> {
            let mut file = fs::File::open(&test_file)
                .map_err(|e| format!("Failed to open test file for reading: {}", e))?;

            loop {
                let n = file
                    .read(&mut read_buf)
                    .map_err(|e| format!("Read error: {}", e))?;
                if n == 0 {
                    break;
                }
                bytes_read += n as u64;

                let progress = (bytes_read as f64 / test_size_bytes as f64 * 100.0) as u32;
                if progress.is_multiple_of(10)
                    && bytes_read % (test_size_bytes / 10).max(1) < CHUNK_SIZE as u64
                {
                    emit_log(
                        &format!(
                            "  Read progress: {}% ({} MB)",
                            progress,
                            bytes_read / 1_048_576
                        ),
                        &mut logs,
                        app,
                    );
                }
            }
            Ok(())
        })();

        let read_duration = read_start.elapsed();
        let read_speed_mbps = if read_duration.as_secs_f64() > 0.0 {
            bytes_read as f64 / 1_048_576.0 / read_duration.as_secs_f64()
        } else {
            0.0
        };

        if let Err(e) = read_result {
            emit_log(&format!("ERROR: Read test failed: {}", e), &mut logs, app);
            cleanup(&temp_dir, &mut logs, app);

            findings.push(ServiceFinding {
                severity: FindingSeverity::Critical,
                title: "Read Test Failed".to_string(),
                description: e.clone(),
                recommendation: Some(
                    "The USB drive may be corrupted or disconnected during the test.".to_string(),
                ),
                data: Some(json!({ "type": "usb_error", "error": "read_failed" })),
            });
            return ServiceResult {
                service_id: service_id.to_string(),
                success: false,
                error: Some(e),
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
                agent_analysis: None,
            };
        }

        emit_log(
            &format!(
                "Read complete: {:.1} MB/s ({:.1}s for {} MB)",
                read_speed_mbps,
                read_duration.as_secs_f64(),
                test_size_mb
            ),
            &mut logs,
            app,
        );

        let SpeedRating {
            severity: read_severity,
            label: read_label,
            description: read_desc,
            recommendation: read_rec,
        } = rate_speed(read_speed_mbps, true);
        findings.push(ServiceFinding {
            severity: read_severity,
            title: format!("Sequential Read: {:.1} MB/s", read_speed_mbps),
            description: format!(
                "Read {} MB in {:.1} seconds. {}",
                test_size_mb,
                read_duration.as_secs_f64(),
                read_desc
            ),
            recommendation: read_rec,
            data: Some(json!({
                "type": "usb_read_speed",
                "speedMbps": read_speed_mbps,
                "bytesRead": bytes_read,
                "durationSecs": read_duration.as_secs_f64(),
                "rating": read_label,
            })),
        });

        // =====================================================================
        // Phase 4: Data Integrity Verification
        // =====================================================================
        let mut integrity_pass = true;
        let mut integrity_errors: u64 = 0;
        let mut first_error_offset: Option<u64> = None;

        if verify_integrity {
            emit_log("Phase 4: Data integrity verification...", &mut logs, app);

            let verify_result = (|| -> Result<(bool, u64, Option<u64>), String> {
                let mut file = fs::File::open(&test_file)
                    .map_err(|e| format!("Failed to open test file for verification: {}", e))?;

                let mut verify_buf = vec![0u8; CHUNK_SIZE];
                let mut offset: u64 = 0;
                let mut errors: u64 = 0;
                let mut first_err: Option<u64> = None;

                loop {
                    let n = file
                        .read(&mut verify_buf)
                        .map_err(|e| format!("Read error during verification: {}", e))?;
                    if n == 0 {
                        break;
                    }

                    for (i, &byte) in verify_buf[..n].iter().enumerate() {
                        let expected = if i % 2 == 0 {
                            PATTERN_BYTE_A
                        } else {
                            PATTERN_BYTE_B
                        };
                        if byte != expected {
                            errors += 1;
                            if first_err.is_none() {
                                first_err = Some(offset + i as u64);
                            }
                        }
                    }
                    offset += n as u64;

                    let progress = (offset as f64 / test_size_bytes as f64 * 100.0) as u32;
                    if progress.is_multiple_of(20)
                        && offset % (test_size_bytes / 5).max(1) < CHUNK_SIZE as u64
                    {
                        emit_log(&format!("  Verify progress: {}%", progress), &mut logs, app);
                    }
                }

                Ok((errors == 0, errors, first_err))
            })();

            match verify_result {
                Ok((pass, errors, first_err)) => {
                    integrity_pass = pass;
                    integrity_errors = errors;
                    first_error_offset = first_err;

                    if pass {
                        emit_log(
                            "Integrity check PASSED — all bytes verified correctly",
                            &mut logs,
                            app,
                        );
                    } else {
                        emit_log(
                            &format!(
                                "Integrity check FAILED — {} byte errors detected (first at offset {})",
                                errors,
                                first_err.unwrap_or(0)
                            ),
                            &mut logs,
                            app,
                        );
                    }
                }
                Err(e) => {
                    emit_log(
                        &format!("ERROR: Integrity verification failed: {}", e),
                        &mut logs,
                        app,
                    );
                    integrity_pass = false;
                }
            }

            let integrity_severity = if integrity_pass {
                FindingSeverity::Success
            } else if integrity_errors < 100 {
                FindingSeverity::Error
            } else {
                FindingSeverity::Critical
            };

            findings.push(ServiceFinding {
                severity: integrity_severity,
                title: if integrity_pass {
                    "Data Integrity: PASS".to_string()
                } else {
                    format!("Data Integrity: FAIL ({} errors)", integrity_errors)
                },
                description: if integrity_pass {
                    format!("All {} MB of written data verified byte-by-byte with zero corruption.", test_size_mb)
                } else {
                    format!(
                        "{} byte-level errors detected across {} MB. First error at offset {}. This indicates flash cell failure or a counterfeit drive.",
                        integrity_errors,
                        test_size_mb,
                        first_error_offset.unwrap_or(0)
                    )
                },
                recommendation: if integrity_pass {
                    None
                } else {
                    Some("This drive should NOT be used for important data. Replace it immediately — data stored on this drive may become corrupt.".to_string())
                },
                data: Some(json!({
                    "type": "usb_integrity",
                    "pass": integrity_pass,
                    "errorCount": integrity_errors,
                    "firstErrorOffset": first_error_offset,
                    "bytesVerified": test_size_bytes,
                })),
            });
        } else {
            emit_log(
                "Phase 4: Skipped (integrity check disabled)",
                &mut logs,
                app,
            );
        }

        // =====================================================================
        // Phase 5: Random I/O Latency Test
        // =====================================================================
        emit_log(
            "Phase 5: Random I/O latency test (100 random 4KB reads)...",
            &mut logs,
            app,
        );

        let random_io_result = (|| -> Result<(f64, f64, f64), String> {
            let mut file = fs::File::open(&test_file)
                .map_err(|e| format!("Failed to open file for random I/O: {}", e))?;
            let file_size = test_size_bytes;
            let mut small_buf = vec![0u8; RANDOM_IO_BLOCK];
            let mut latencies: Vec<f64> = Vec::with_capacity(RANDOM_IO_ITERATIONS);

            // Simple deterministic "random" offsets using a linear congruential generator
            let mut seed: u64 = 12345;
            for _ in 0..RANDOM_IO_ITERATIONS {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                let offset = seed % (file_size.saturating_sub(RANDOM_IO_BLOCK as u64));

                let io_start = Instant::now();
                file.seek(SeekFrom::Start(offset))
                    .map_err(|e| format!("Seek error: {}", e))?;
                file.read_exact(&mut small_buf)
                    .map_err(|e| format!("Random read error: {}", e))?;
                let latency_ms = io_start.elapsed().as_secs_f64() * 1000.0;
                latencies.push(latency_ms);
            }

            let avg = latencies.iter().sum::<f64>() / latencies.len() as f64;
            let min = latencies.iter().cloned().fold(f64::INFINITY, f64::min);
            let max = latencies.iter().cloned().fold(0.0_f64, f64::max);

            Ok((avg, min, max))
        })();

        match random_io_result {
            Ok((avg_ms, min_ms, max_ms)) => {
                emit_log(
                    &format!(
                        "Random I/O: avg {:.2}ms, min {:.2}ms, max {:.2}ms",
                        avg_ms, min_ms, max_ms
                    ),
                    &mut logs,
                    app,
                );

                let io_severity = if avg_ms > 50.0 {
                    FindingSeverity::Error
                } else if avg_ms > 10.0 {
                    FindingSeverity::Warning
                } else if avg_ms > 2.0 {
                    FindingSeverity::Info
                } else {
                    FindingSeverity::Success
                };

                let io_description = if avg_ms > 50.0 {
                    "Very slow random access — the drive controller may be failing or severely bottlenecked."
                } else if avg_ms > 10.0 {
                    "Elevated random access latency. Typical for USB 2.0 or older flash drives."
                } else if avg_ms > 2.0 {
                    "Normal random access latency for a USB flash drive."
                } else {
                    "Excellent random access latency — consistent with USB 3.0+ drives."
                };

                findings.push(ServiceFinding {
                    severity: io_severity,
                    title: format!("Random I/O: {:.2}ms avg latency", avg_ms),
                    description: format!(
                        "100 random 4KB reads — avg {:.2}ms, min {:.2}ms, max {:.2}ms. {}",
                        avg_ms, min_ms, max_ms, io_description
                    ),
                    recommendation: if avg_ms > 50.0 {
                        Some("Consider replacing this drive. High latency indicates controller issues.".to_string())
                    } else {
                        None
                    },
                    data: Some(json!({
                        "type": "usb_random_io",
                        "avgMs": avg_ms,
                        "minMs": min_ms,
                        "maxMs": max_ms,
                        "iterations": RANDOM_IO_ITERATIONS,
                        "blockSize": RANDOM_IO_BLOCK,
                    })),
                });
            }
            Err(e) => {
                emit_log(
                    &format!("Warning: Random I/O test failed: {}", e),
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Warning,
                    title: "Random I/O Test Failed".to_string(),
                    description: e,
                    recommendation: None,
                    data: Some(json!({ "type": "usb_error", "error": "random_io_failed" })),
                });
            }
        }

        // =====================================================================
        // Phase 6: Capacity Spot-Check
        // =====================================================================
        emit_log("Phase 6: Capacity verification...", &mut logs, app);

        // Re-read disk info after writing
        let disks_after = Disks::new_with_refreshed_list();
        let disk_after = disks_after.list().iter().find(|d| {
            d.mount_point()
                .to_string_lossy()
                .trim_end_matches('\\')
                .eq_ignore_ascii_case(mount_point.trim_end_matches('\\'))
        });

        if let Some(disk_after) = disk_after {
            let space_after = disk_after.available_space();
            let space_used_by_test = available_space.saturating_sub(space_after);
            let expected_used = test_size_bytes;

            // Allow 5% tolerance + 10MB overhead for filesystem metadata
            let tolerance = (expected_used as f64 * 0.05) as u64 + (10 * 1024 * 1024);
            let discrepancy = space_used_by_test.abs_diff(expected_used);

            let capacity_ok = discrepancy <= tolerance;

            emit_log(
                &format!(
                    "Capacity check: expected ~{} MB used, actual ~{} MB used (discrepancy: {} MB)",
                    expected_used / 1_048_576,
                    space_used_by_test / 1_048_576,
                    discrepancy / 1_048_576
                ),
                &mut logs,
                app,
            );

            if capacity_ok {
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Success,
                    title: "Capacity Verification: PASS".to_string(),
                    description: format!(
                        "Reported capacity matches actual storage. Wrote {} MB, space used: {} MB.",
                        expected_used / 1_048_576,
                        space_used_by_test / 1_048_576
                    ),
                    recommendation: None,
                    data: Some(json!({
                        "type": "usb_capacity",
                        "pass": true,
                        "expectedMb": expected_used / 1_048_576,
                        "actualUsedMb": space_used_by_test / 1_048_576,
                        "discrepancyMb": discrepancy / 1_048_576,
                    })),
                });
            } else {
                emit_log(
                    "WARNING: Significant capacity discrepancy — possible fake drive!",
                    &mut logs,
                    app,
                );
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Critical,
                    title: "⚠ FAKE DRIVE SUSPECTED".to_string(),
                    description: format!(
                        "Capacity mismatch detected! Expected ~{} MB used but only ~{} MB was actually stored. This drive may report a larger capacity than its actual storage.",
                        expected_used / 1_048_576,
                        space_used_by_test / 1_048_576
                    ),
                    recommendation: Some("Do NOT use this drive for important data. It likely has less real storage than advertised. Consider returning it.".to_string()),
                    data: Some(json!({
                        "type": "usb_capacity",
                        "pass": false,
                        "expectedMb": expected_used / 1_048_576,
                        "actualUsedMb": space_used_by_test / 1_048_576,
                        "discrepancyMb": discrepancy / 1_048_576,
                        "fakeDriveSuspected": true,
                    })),
                });
            }
        } else {
            emit_log(
                "Warning: Could not re-detect drive for capacity check",
                &mut logs,
                app,
            );
        }

        // =====================================================================
        // Cleanup
        // =====================================================================
        cleanup(&temp_dir, &mut logs, app);

        // =====================================================================
        // Overall Summary
        // =====================================================================
        let total_duration = start.elapsed();
        let has_critical = findings
            .iter()
            .any(|f| matches!(f.severity, FindingSeverity::Critical));
        let has_errors = findings
            .iter()
            .any(|f| matches!(f.severity, FindingSeverity::Error));
        let has_warnings = findings
            .iter()
            .any(|f| matches!(f.severity, FindingSeverity::Warning));

        let overall_status = if has_critical {
            "FAIL"
        } else if has_errors {
            "ISSUES DETECTED"
        } else if has_warnings {
            "PASS WITH WARNINGS"
        } else {
            "PASS"
        };

        let overall_severity = if has_critical {
            FindingSeverity::Critical
        } else if has_errors {
            FindingSeverity::Error
        } else if has_warnings {
            FindingSeverity::Warning
        } else {
            FindingSeverity::Success
        };

        emit_log(
            &format!(
                "USB Stability Test complete: {} (took {:.1}s)",
                overall_status,
                total_duration.as_secs_f64()
            ),
            &mut logs,
            app,
        );

        // Insert summary finding at the beginning
        findings.insert(
            0,
            ServiceFinding {
                severity: overall_severity,
                title: format!("USB Stability Test: {}", overall_status),
                description: format!(
                    "Tested {} ({}) — {} on {}. Write: {:.1} MB/s, Read: {:.1} MB/s. Integrity: {}.",
                    mount_point,
                    volume_label,
                    format_bytes(total_space),
                    fs_type,
                    write_speed_mbps,
                    read_speed_mbps,
                    if !verify_integrity {
                        "skipped"
                    } else if integrity_pass {
                        "PASS"
                    } else {
                        "FAIL"
                    }
                ),
                recommendation: None,
                data: Some(json!({
                    "type": "usb_summary",
                    "drivePath": mount_point,
                    "volumeLabel": volume_label,
                    "fileSystem": fs_type,
                    "totalSpaceBytes": total_space,
                    "availableSpaceBytes": available_space,
                    "testSizeMb": test_size_mb,
                    "intensity": intensity,
                    "writeSpeedMbps": write_speed_mbps,
                    "readSpeedMbps": read_speed_mbps,
                    "writeDurationSecs": write_duration.as_secs_f64(),
                    "readDurationSecs": read_duration.as_secs_f64(),
                    "integrityPass": integrity_pass,
                    "integrityErrors": integrity_errors,
                    "integrityChecked": verify_integrity,
                    "overallStatus": overall_status,
                    "totalDurationSecs": total_duration.as_secs_f64(),
                })),
            },
        );

        ServiceResult {
            service_id: service_id.to_string(),
            success: !has_critical && !has_errors,
            error: None,
            duration_ms: total_duration.as_millis() as u64,
            findings,
            logs,
            agent_analysis: None,
        }
    }
}

// =============================================================================
// Helper Types & Functions
// =============================================================================

struct SpeedRating {
    severity: FindingSeverity,
    label: String,
    description: String,
    recommendation: Option<String>,
}

fn rate_speed(speed_mbps: f64, is_read: bool) -> SpeedRating {
    let direction = if is_read { "read" } else { "write" };

    if speed_mbps >= 100.0 {
        SpeedRating {
            severity: FindingSeverity::Success,
            label: "Excellent".to_string(),
            description: format!("Excellent {} speed — consistent with USB 3.0+.", direction),
            recommendation: None,
        }
    } else if speed_mbps >= 50.0 {
        SpeedRating {
            severity: FindingSeverity::Success,
            label: "Good".to_string(),
            description: format!("Good {} speed — typical for USB 3.0 drives.", direction),
            recommendation: None,
        }
    } else if speed_mbps >= 20.0 {
        SpeedRating {
            severity: FindingSeverity::Info,
            label: "Average".to_string(),
            description: format!(
                "Average {} speed — possibly USB 2.0 or a slower USB 3.0 drive.",
                direction
            ),
            recommendation: Some(
                "Try a USB 3.0 port if available for better performance.".to_string(),
            ),
        }
    } else if speed_mbps >= 5.0 {
        SpeedRating {
            severity: FindingSeverity::Warning,
            label: "Slow".to_string(),
            description: format!("Slow {} speed — typical of USB 2.0 connections or aging flash memory.", direction),
            recommendation: Some("Ensure the drive is in a USB 3.0 port. If already in USB 3.0, the drive's flash memory may be worn.".to_string()),
        }
    } else {
        SpeedRating {
            severity: FindingSeverity::Error,
            label: "Very Slow".to_string(),
            description: format!("Very slow {} speed — indicates a failing drive or severely bottlenecked connection.", direction),
            recommendation: Some("This drive may be failing. Consider replacing it.".to_string()),
        }
    }
}

fn format_bytes(bytes: u64) -> String {
    let gb = bytes as f64 / 1_073_741_824.0;
    if gb >= 1000.0 {
        format!("{:.1} TB", gb / 1024.0)
    } else {
        format!("{:.1} GB", gb)
    }
}
