//! RustService Backend Library
//!
//! Tauri backend for the RustService Windows desktop toolkit.
//! Handles system operations, data folder management, settings persistence,
//! and system information collection.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use sysinfo::{Disks, Motherboard, System};

// ============================================================================
// Settings Types
// ============================================================================

/// Application settings schema
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// User's theme preference: "light", "dark", or "system"
    pub theme: String,
    /// Application version for settings migration
    pub version: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: String::from("system"),
            version: String::from("0.1.0"),
        }
    }
}

// ============================================================================
// System Info Types
// ============================================================================

/// Operating system information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub name: Option<String>,
    pub kernel_version: Option<String>,
    pub os_version: Option<String>,
    pub long_os_version: Option<String>,
    pub hostname: Option<String>,
}

/// CPU/Processor information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub brand: String,
    pub vendor_id: String,
    pub physical_cores: Option<usize>,
    pub logical_cpus: usize,
    pub frequency_mhz: u64,
    pub global_usage: f32,
}

/// Memory (RAM/Swap) information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total_memory: u64,
    pub used_memory: u64,
    pub available_memory: u64,
    pub total_swap: u64,
    pub used_swap: u64,
}

/// Disk/Storage information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub file_system: String,
    pub disk_type: String,
    pub is_removable: bool,
}

/// Motherboard information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotherboardInfo {
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub version: Option<String>,
    pub serial_number: Option<String>,
}

/// Complete system information response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: OsInfo,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub disks: Vec<DiskInfo>,
    pub motherboard: Option<MotherboardInfo>,
    pub uptime_seconds: u64,
    pub boot_time: u64,
}

// ============================================================================
// System Info Command
// ============================================================================

/// Collects comprehensive system information
///
/// Returns OS, CPU, memory, disk, and motherboard information.
/// This is designed to be extensible for future additions.
#[tauri::command]
fn get_system_info() -> Result<SystemInfo, String> {
    // Create system instance and refresh relevant data
    let mut sys = System::new_all();
    sys.refresh_all();

    // Collect OS info
    let os = OsInfo {
        name: System::name(),
        kernel_version: System::kernel_version(),
        os_version: System::os_version(),
        long_os_version: System::long_os_version(),
        hostname: System::host_name(),
    };

    // Collect CPU info
    let cpu = {
        let cpus = sys.cpus();
        let first_cpu = cpus.first();

        CpuInfo {
            brand: first_cpu.map(|c| c.brand().to_string()).unwrap_or_default(),
            vendor_id: first_cpu
                .map(|c| c.vendor_id().to_string())
                .unwrap_or_default(),
            physical_cores: System::physical_core_count(),
            logical_cpus: cpus.len(),
            frequency_mhz: first_cpu.map(|c| c.frequency()).unwrap_or(0),
            global_usage: sys.global_cpu_usage(),
        }
    };

    // Collect memory info
    let memory = MemoryInfo {
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
        available_memory: sys.available_memory(),
        total_swap: sys.total_swap(),
        used_swap: sys.used_swap(),
    };

    // Collect disk info
    let disk_list = Disks::new_with_refreshed_list();
    let disks: Vec<DiskInfo> = disk_list
        .iter()
        .map(|disk| DiskInfo {
            name: disk.name().to_string_lossy().to_string(),
            mount_point: disk.mount_point().to_string_lossy().to_string(),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            file_system: disk.file_system().to_string_lossy().to_string(),
            disk_type: format!("{:?}", disk.kind()),
            is_removable: disk.is_removable(),
        })
        .collect();

    // Collect motherboard info (may not be available on all systems)
    let motherboard = Motherboard::new().map(|mb| MotherboardInfo {
        name: mb.name(),
        vendor: mb.vendor_name(),
        version: mb.version(),
        serial_number: mb.serial_number(),
    });

    Ok(SystemInfo {
        os,
        cpu,
        memory,
        disks,
        motherboard,
        uptime_seconds: System::uptime(),
        boot_time: System::boot_time(),
    })
}

// ============================================================================
// Data Folder Functions
// ============================================================================

/// Gets the path to the data directory.
/// In production, this is adjacent to the executable.
/// In development, this is in the project root.
fn get_data_dir_path() -> PathBuf {
    // Try to get the executable's directory first (production)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let data_dir = exe_dir.join("data");
            // Check if we're in a development environment by looking for src-tauri
            // If we are, use the project root instead
            if !exe_dir.join("src-tauri").exists() && !exe_dir.to_string_lossy().contains("target")
            {
                return data_dir;
            }
        }
    }

    // Fallback to current directory (development)
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("data")
}

/// Returns the path to the data directory
#[tauri::command]
fn get_data_dir() -> Result<String, String> {
    let data_dir = get_data_dir_path();
    Ok(data_dir.to_string_lossy().to_string())
}

/// Creates the data directory structure if it doesn't exist
#[tauri::command]
fn ensure_data_dir() -> Result<(), String> {
    let data_dir = get_data_dir_path();

    // Create main data directory and subdirectories
    let subdirs = ["programs", "logs", "reports", "scripts"];

    for subdir in subdirs {
        let path = data_dir.join(subdir);
        if !path.exists() {
            fs::create_dir_all(&path)
                .map_err(|e| format!("Failed to create directory {:?}: {}", path, e))?;
        }
    }

    // Create default settings file if it doesn't exist
    let settings_path = data_dir.join("settings.json");
    if !settings_path.exists() {
        let default_settings = AppSettings::default();
        let settings_json = serde_json::to_string_pretty(&default_settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        fs::write(&settings_path, settings_json)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;
    }

    Ok(())
}

// ============================================================================
// Settings Commands
// ============================================================================

/// Retrieves the current application settings
#[tauri::command]
fn get_settings() -> Result<AppSettings, String> {
    let data_dir = get_data_dir_path();
    let settings_path = data_dir.join("settings.json");

    if !settings_path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Saves the application settings
#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    let data_dir = get_data_dir_path();

    // Ensure directory exists
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;
    }

    let settings_path = data_dir.join("settings.json");
    let settings_json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, settings_json).map_err(|e| format!("Failed to write settings: {}", e))
}

// ============================================================================
// Utility Commands
// ============================================================================

/// Opens a folder in the system file explorer
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for other platforms (shouldn't be needed for Windows-only app)
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

// ============================================================================
// Application Entry Point
// ============================================================================

/// Tauri application entry point
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_data_dir,
            ensure_data_dir,
            get_settings,
            save_settings,
            open_folder,
            get_system_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
