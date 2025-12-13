//! Data directory management commands

use std::fs;
use std::path::PathBuf;

use crate::types::AppSettings;

/// Gets the path to the data directory.
/// In production, this is adjacent to the executable.
/// In development, this is in the project root.
pub fn get_data_dir_path() -> PathBuf {
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
pub fn get_data_dir() -> Result<String, String> {
    let data_dir = get_data_dir_path();
    Ok(data_dir.to_string_lossy().to_string())
}

/// Creates the data directory structure if it doesn't exist
#[tauri::command]
pub fn ensure_data_dir() -> Result<(), String> {
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
