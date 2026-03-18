//! System Restore Point commands
//!
//! Lists and creates Windows System Restore Points using PowerShell.

use serde::{Deserialize, Serialize};
use std::process::Command;

// ============================================================================
// Types
// ============================================================================

/// A Windows System Restore Point
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePoint {
    pub sequence_number: u32,
    pub description: String,
    pub creation_time: String,
    pub restore_type: String,
}

/// Response from get_restore_points
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePointsResponse {
    pub restore_points: Vec<RestorePoint>,
    pub error: Option<String>,
}

// ============================================================================
// Helpers
// ============================================================================

/// Map restore point type number to human-readable label
fn restore_type_label(type_num: u64) -> String {
    match type_num {
        0 => "Application Install".to_string(),
        1 => "Application Uninstall".to_string(),
        6 => "Restore".to_string(),
        7 => "Checkpoint".to_string(),
        10 => "Device Driver Install".to_string(),
        11 => "First Run".to_string(),
        12 => "Modify Settings".to_string(),
        13 => "Cancelled Operation".to_string(),
        _ => format!("Type {}", type_num),
    }
}

// ============================================================================
// Commands
// ============================================================================

/// List all system restore points
#[tauri::command]
pub async fn get_restore_points() -> RestorePointsResponse {
    tokio::task::spawn_blocking(get_restore_points_blocking)
        .await
        .unwrap_or_else(|e| RestorePointsResponse {
            restore_points: Vec::new(),
            error: Some(format!("Restore points task failed: {e}")),
        })
}

fn get_restore_points_blocking() -> RestorePointsResponse {
    let ps_script = r#"
        try {
            $points = Get-ComputerRestorePoint -ErrorAction SilentlyContinue
            if ($null -eq $points) {
                Write-Output '[]'
            } else {
                $points | Select-Object SequenceNumber, Description, @{N='CreationTime';E={$_.ConvertToDateTime($_.CreationTime).ToString('yyyy-MM-ddTHH:mm:ss')}}, RestorePointType | ConvertTo-Json -Compress
            }
        } catch {
            Write-Output '[]'
        }
    "#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", ps_script])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();

            if stdout.is_empty() || stdout == "[]" {
                return RestorePointsResponse {
                    restore_points: Vec::new(),
                    error: None,
                };
            }

            // PowerShell returns a single object (not array) when there's only one result
            let json_val: Result<serde_json::Value, _> = serde_json::from_str(&stdout);
            match json_val {
                Ok(serde_json::Value::Array(arr)) => {
                    let points = arr
                        .iter()
                        .filter_map(parse_restore_point)
                        .collect();
                    RestorePointsResponse {
                        restore_points: points,
                        error: None,
                    }
                }
                Ok(obj @ serde_json::Value::Object(_)) => {
                    // Single restore point (not wrapped in array)
                    let points = parse_restore_point(&obj)
                        .map(|p| vec![p])
                        .unwrap_or_default();
                    RestorePointsResponse {
                        restore_points: points,
                        error: None,
                    }
                }
                _ => RestorePointsResponse {
                    restore_points: Vec::new(),
                    error: Some("Failed to parse restore point data".to_string()),
                },
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            RestorePointsResponse {
                restore_points: Vec::new(),
                error: Some(if stderr.is_empty() {
                    "Failed to retrieve restore points".to_string()
                } else {
                    stderr
                }),
            }
        }
        Err(e) => RestorePointsResponse {
            restore_points: Vec::new(),
            error: Some(format!("Failed to run PowerShell: {}", e)),
        },
    }
}

/// Parse a single restore point from JSON
fn parse_restore_point(val: &serde_json::Value) -> Option<RestorePoint> {
    let seq = val.get("SequenceNumber")?.as_u64()? as u32;
    let desc = val
        .get("Description")
        .and_then(|v| v.as_str())
        .unwrap_or("(no description)")
        .to_string();
    let time = val
        .get("CreationTime")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let rtype = val
        .get("RestorePointType")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    Some(RestorePoint {
        sequence_number: seq,
        description: desc,
        creation_time: time,
        restore_type: restore_type_label(rtype),
    })
}

/// Create a new system restore point (requires admin privileges)
#[tauri::command]
pub async fn create_restore_point(description: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || create_restore_point_blocking(&description))
        .await
        .map_err(|e| format!("Create restore point task failed: {e}"))?
}

pub(crate) fn create_restore_point_blocking(description: &str) -> Result<String, String> {
    // Sanitize the description to prevent command injection
    let safe_desc = description
        .replace(['\'', '"', '`', '$'], "")
        .chars()
        .take(256)
        .collect::<String>();

    if safe_desc.trim().is_empty() {
        return Err("Description cannot be empty".to_string());
    }

    let ps_command = format!(
        "Checkpoint-Computer -Description '{}' -RestorePointType 'MODIFY_SETTINGS'",
        safe_desc
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_command])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            Ok(format!("Restore point '{}' created successfully", safe_desc))
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if stderr.contains("Access") || stderr.contains("privilege") || stderr.contains("denied") {
                Err("Administrator privileges required to create restore points. Run the application as administrator.".to_string())
            } else if stderr.is_empty() {
                let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if stdout.is_empty() {
                    Err("Failed to create restore point. This may require administrator privileges.".to_string())
                } else {
                    Ok(format!("Restore point '{}' created", safe_desc))
                }
            } else {
                Err(format!("Failed to create restore point: {}", stderr))
            }
        }
        Err(e) => Err(format!("Failed to run PowerShell: {}", e)),
    }
}
