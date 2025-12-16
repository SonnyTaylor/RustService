//! Disk Space Service
//!
//! Analyzes disk space usage for all drives on the system.

use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use sysinfo::Disks;
use tauri::{AppHandle, Emitter};

use crate::services::Service;
use crate::types::{FindingSeverity, ServiceDefinition, ServiceFinding, ServiceResult};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct DiskSpaceService;

impl Service for DiskSpaceService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "disk-space".to_string(),
            name: "Disk Space Analysis".to_string(),
            description: "Analyzes disk space usage for all drives".to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 5,
            required_programs: vec![],
            options: vec![],
            icon: "hard-drive".to_string(),
        }
    }

    fn run(&self, _options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "disk-space";

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

        emit_log("Starting disk space analysis...", &mut logs, app);

        let disks = Disks::new_with_refreshed_list();
        let mut drives_data: Vec<serde_json::Value> = Vec::new();
        let mut total_issues = 0;

        for disk in disks.list() {
            let mount_point = disk.mount_point().to_string_lossy().to_string();
            let total_bytes = disk.total_space();
            let available_bytes = disk.available_space();
            let used_bytes = total_bytes.saturating_sub(available_bytes);

            // Skip drives with 0 total space (network drives that are disconnected, etc.)
            if total_bytes == 0 {
                continue;
            }

            let usage_percent = (used_bytes as f64 / total_bytes as f64 * 100.0) as u32;
            let fs_type = disk.file_system().to_string_lossy().to_string();
            let disk_kind = format!("{:?}", disk.kind());

            emit_log(
                &format!(
                    "Drive {}: {:.1} GB used of {:.1} GB ({}%)",
                    mount_point,
                    used_bytes as f64 / 1_073_741_824.0,
                    total_bytes as f64 / 1_073_741_824.0,
                    usage_percent
                ),
                &mut logs,
                app,
            );

            // Determine severity based on usage
            let severity = if usage_percent >= 95 {
                total_issues += 1;
                FindingSeverity::Critical
            } else if usage_percent >= 85 {
                total_issues += 1;
                FindingSeverity::Error
            } else if usage_percent >= 70 {
                FindingSeverity::Warning
            } else {
                FindingSeverity::Success
            };

            // Get status label
            let status = if usage_percent >= 95 {
                "Critical - Almost Full"
            } else if usage_percent >= 85 {
                "Low Space"
            } else if usage_percent >= 70 {
                "OK"
            } else {
                "Healthy"
            };

            drives_data.push(json!({
                "mountPoint": mount_point,
                "totalBytes": total_bytes,
                "usedBytes": used_bytes,
                "availableBytes": available_bytes,
                "usagePercent": usage_percent,
                "fileSystem": fs_type,
                "diskKind": disk_kind,
                "status": status,
            }));

            findings.push(ServiceFinding {
                severity,
                title: format!("Drive {} - {}% Used", mount_point, usage_percent),
                description: format!(
                    "{:.1} GB available of {:.1} GB total ({})",
                    available_bytes as f64 / 1_073_741_824.0,
                    total_bytes as f64 / 1_073_741_824.0,
                    fs_type
                ),
                recommendation: if usage_percent >= 85 {
                    Some(
                        "Consider freeing up disk space by removing unused files or programs."
                            .to_string(),
                    )
                } else {
                    None
                },
                data: Some(json!({
                    "type": "drive",
                    "mountPoint": mount_point,
                    "usagePercent": usage_percent,
                    "availableGb": available_bytes as f64 / 1_073_741_824.0,
                    "totalGb": total_bytes as f64 / 1_073_741_824.0,
                })),
            });
        }

        // Add summary finding with all drives data for the chart
        let overall_severity = if total_issues > 0 {
            FindingSeverity::Error
        } else {
            FindingSeverity::Success
        };

        findings.insert(
            0,
            ServiceFinding {
                severity: overall_severity,
                title: format!("{} drive(s) analyzed", drives_data.len()),
                description: if total_issues > 0 {
                    format!("{} drive(s) have low disk space", total_issues)
                } else {
                    "All drives have adequate free space".to_string()
                },
                recommendation: None,
                data: Some(json!({
                    "type": "disk_summary",
                    "drives": drives_data,
                })),
            },
        );

        emit_log("Disk space analysis complete", &mut logs, app);

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
