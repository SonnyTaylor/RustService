//! System Restore Point Service
//!
//! Creates a Windows system restore point before maintenance work.

use std::time::Instant;
use tauri::{AppHandle, Emitter};

use crate::services::Service;
use crate::types::{
    FindingSeverity, ServiceDefinition, ServiceFinding, ServiceOptionSchema, ServiceResult,
};

pub struct RestorePointService;

impl Service for RestorePointService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "restore-point".to_string(),
            name: "System Restore Point".to_string(),
            description: "Creates a system restore point before maintenance work".to_string(),
            category: "maintenance".to_string(),
            estimated_duration_secs: 30,
            required_programs: vec![],
            options: vec![ServiceOptionSchema {
                id: "description".to_string(),
                label: "Restore Point Description".to_string(),
                option_type: "string".to_string(),
                default_value: serde_json::json!("RustService Pre-Service Restore Point"),
                min: None,
                max: None,
                options: None,
                description: Some("Description for the restore point".to_string()),
            }],
            icon: "shield-check".to_string(),
            exclusive_resources: vec![],
            dependencies: vec![],
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();

        let description = options
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("RustService Pre-Service Restore Point")
            .to_string();

        let _ = app.emit("service-log", serde_json::json!({
            "service_id": "restore-point",
            "message": format!("Creating restore point: {}", description)
        }));

        match crate::commands::restore_points::create_restore_point_blocking(&description) {
            Ok(msg) => {
                let _ = app.emit("service-log", serde_json::json!({
                    "service_id": "restore-point",
                    "message": format!("Restore point created: {}", msg)
                }));

                ServiceResult {
                    service_id: "restore-point".to_string(),
                    success: true,
                    error: None,
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings: vec![ServiceFinding {
                        severity: FindingSeverity::Success,
                        title: "Restore Point Created".to_string(),
                        description: format!("Successfully created restore point: {}", description),
                        recommendation: None,
                        data: Some(serde_json::json!({
                            "type": "restore_point_result",
                            "description": description,
                            "success": true
                        })),
                    }],
                    logs: vec![msg],
                    agent_analysis: None,
                }
            }
            Err(e) => {
                let is_access_denied = e.to_lowercase().contains("access")
                    || e.to_lowercase().contains("privilege")
                    || e.to_lowercase().contains("administrator");

                let _ = app.emit("service-log", serde_json::json!({
                    "service_id": "restore-point",
                    "message": format!("Failed to create restore point: {}", e)
                }));

                ServiceResult {
                    service_id: "restore-point".to_string(),
                    success: false,
                    error: Some(e.clone()),
                    duration_ms: start.elapsed().as_millis() as u64,
                    findings: vec![ServiceFinding {
                        severity: if is_access_denied {
                            FindingSeverity::Warning
                        } else {
                            FindingSeverity::Error
                        },
                        title: if is_access_denied {
                            "Insufficient Privileges".to_string()
                        } else {
                            "Restore Point Failed".to_string()
                        },
                        description: e,
                        recommendation: if is_access_denied {
                            Some("Run RustService as administrator to create restore points".to_string())
                        } else {
                            Some("Check that System Protection is enabled for the system drive".to_string())
                        },
                        data: Some(serde_json::json!({
                            "type": "restore_point_result",
                            "success": false
                        })),
                    }],
                    logs: vec![],
                    agent_analysis: None,
                }
            }
        }
    }
}
