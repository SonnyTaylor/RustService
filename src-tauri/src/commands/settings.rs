//! Settings management commands

use std::fs;

use crate::commands::get_data_dir_path;
use crate::types::AppSettings;

/// Retrieves the current application settings
#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
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
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
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
