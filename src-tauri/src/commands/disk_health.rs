//! Disk health commands
//!
//! Retrieves S.M.A.R.T. disk health data using smartctl.
//! Falls back gracefully if smartctl is not installed.

use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::commands::get_program_exe_path;

// ============================================================================
// Types
// ============================================================================

/// A single S.M.A.R.T. attribute
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartAttribute {
    pub id: u32,
    pub name: String,
    pub value: u32,
    pub worst: u32,
    pub threshold: u32,
    pub raw_value: String,
}

/// Health information for a single disk
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskHealthInfo {
    pub device: String,
    pub model: String,
    pub serial: String,
    pub firmware: String,
    pub health_passed: bool,
    pub temperature_c: Option<i32>,
    pub power_on_hours: Option<u64>,
    pub reallocated_sectors: Option<u64>,
    pub pending_sectors: Option<u64>,
    pub crc_errors: Option<u64>,
    pub wear_leveling_pct: Option<u8>,
    pub attributes: Vec<SmartAttribute>,
}

/// Response from get_disk_health
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskHealthResponse {
    pub disks: Vec<DiskHealthInfo>,
    pub smartctl_found: bool,
    pub error: Option<String>,
}

// ============================================================================
// Helpers
// ============================================================================

/// Find smartctl executable using the centralized program resolver.
/// This checks settings overrides and recursively searches the data/programs folder,
/// matching the same logic used by the Programs page and smartctl service.
fn find_smartctl() -> Option<String> {
    // Use the centralized program resolver (checks overrides + recursive data/programs search)
    if let Ok(Some(path)) = get_program_exe_path("smartctl".to_string()) {
        return Some(path);
    }

    // Fallback: check PATH and common install locations
    if let Ok(output) = Command::new("where").arg("smartctl").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    let common_paths = [
        r"C:\Program Files\smartmontools\bin\smartctl.exe",
        r"C:\Program Files (x86)\smartmontools\bin\smartctl.exe",
    ];
    for path in &common_paths {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    None
}

/// List physical drives on Windows using wmic
fn list_physical_drives() -> Vec<String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-PhysicalDisk | Select-Object -ExpandProperty DeviceId | Sort-Object",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            text.lines()
                .filter_map(|line| {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        // Convert device ID to smartctl format: /dev/pd{N}
                        Some(format!("/dev/pd{}", trimmed))
                    }
                })
                .collect()
        }
        _ => {
            // Fallback: try first 4 drives
            (0..4).map(|i| format!("/dev/pd{}", i)).collect()
        }
    }
}

/// Parse smartctl JSON output for a single drive
fn parse_smartctl_json(json_str: &str) -> Option<DiskHealthInfo> {
    let json: serde_json::Value = serde_json::from_str(json_str).ok()?;

    // Check if smartctl returned valid data
    let exit_status = json.get("smartctl")?.get("exit_status")?.as_u64()?;
    // Bits 0-1 indicate command failure, allow other bits (health warnings etc.)
    if exit_status & 0x03 != 0 {
        return None;
    }

    let device = json
        .get("device")?
        .get("name")?
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let model = json
        .get("model_name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Model")
        .to_string();

    let serial = json
        .get("serial_number")
        .and_then(|v| v.as_str())
        .unwrap_or("N/A")
        .to_string();

    let firmware = json
        .get("firmware_version")
        .and_then(|v| v.as_str())
        .unwrap_or("N/A")
        .to_string();

    let health_passed = json
        .get("smart_status")
        .and_then(|s| s.get("passed"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let temperature_c = json
        .get("temperature")
        .and_then(|t| t.get("current"))
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    let power_on_hours = json
        .get("power_on_time")
        .and_then(|t| t.get("hours"))
        .and_then(|v| v.as_u64());

    // Parse ATA SMART attributes
    let mut attributes = Vec::new();
    let mut reallocated_sectors: Option<u64> = None;
    let mut pending_sectors: Option<u64> = None;
    let mut crc_errors: Option<u64> = None;
    let mut wear_leveling_pct: Option<u8> = None;

    if let Some(table) = json
        .get("ata_smart_attributes")
        .and_then(|a| a.get("table"))
        .and_then(|t| t.as_array())
    {
        for attr in table {
            let id = attr.get("id").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let name = attr
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let value = attr.get("value").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let worst = attr.get("worst").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let thresh = attr.get("thresh").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

            let raw_value = attr
                .get("raw")
                .and_then(|r| r.get("string"))
                .and_then(|v| v.as_str())
                .or_else(|| {
                    attr.get("raw")
                        .and_then(|r| r.get("value"))
                        .and_then(|v| v.as_u64())
                        .map(|_| "")
                })
                .unwrap_or("0");

            let raw_num = attr
                .get("raw")
                .and_then(|r| r.get("value"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            // Extract key metrics by attribute ID
            match id {
                5 => reallocated_sectors = Some(raw_num),        // Reallocated Sector Count
                197 => pending_sectors = Some(raw_num),           // Current Pending Sector Count
                199 => crc_errors = Some(raw_num),                // UDMA CRC Error Count
                177 | 231 => wear_leveling_pct = Some(value as u8), // Wear Leveling Count / SSD Life Left
                _ => {}
            }

            attributes.push(SmartAttribute {
                id,
                name,
                value,
                worst,
                threshold: thresh,
                raw_value: raw_value.to_string(),
            });
        }
    }

    // Also check NVMe health info
    if let Some(nvme_health) = json.get("nvme_smart_health_information_log") {
        if wear_leveling_pct.is_none() {
            if let Some(pct_used) = nvme_health.get("percentage_used").and_then(|v| v.as_u64()) {
                wear_leveling_pct = Some((100u64.saturating_sub(pct_used)) as u8);
            }
        }
    }

    Some(DiskHealthInfo {
        device,
        model,
        serial,
        firmware,
        health_passed,
        temperature_c,
        power_on_hours,
        reallocated_sectors,
        pending_sectors,
        crc_errors,
        wear_leveling_pct,
        attributes,
    })
}

// ============================================================================
// Commands
// ============================================================================

/// Get S.M.A.R.T. health data for all detected disks
#[tauri::command]
pub async fn get_disk_health() -> DiskHealthResponse {
    tokio::task::spawn_blocking(get_disk_health_blocking)
        .await
        .unwrap_or_else(|e| DiskHealthResponse {
            disks: Vec::new(),
            smartctl_found: false,
            error: Some(format!("Disk health task failed: {e}")),
        })
}

fn get_disk_health_blocking() -> DiskHealthResponse {
    let smartctl_path = match find_smartctl() {
        Some(path) => path,
        None => {
            return DiskHealthResponse {
                disks: Vec::new(),
                smartctl_found: false,
                error: Some("smartctl not found. Install smartmontools for S.M.A.R.T. health data.".to_string()),
            };
        }
    };

    let drives = list_physical_drives();
    let mut disks = Vec::new();

    for drive in &drives {
        let output = Command::new(&smartctl_path)
            .args(["-a", drive, "--json"])
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if let Some(info) = parse_smartctl_json(&stdout) {
                    disks.push(info);
                }
            }
            Err(_) => {}
        }
    }

    DiskHealthResponse {
        disks,
        smartctl_found: true,
        error: None,
    }
}
