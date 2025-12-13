//! RustService Backend Library
//!
//! Tauri backend for the RustService Windows desktop toolkit.
//! Handles system operations, data folder management, and settings persistence.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
