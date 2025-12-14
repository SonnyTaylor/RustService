//! Settings management commands

use std::fs;

use crate::commands::get_data_dir_path;
use crate::types::{migrate_settings, AppSettings};

/// Retrieves the current application settings
///
/// Reads from `data/settings.json`, applies migrations if needed,
/// and returns the settings object. Returns defaults if file doesn't exist.
#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    let data_dir = get_data_dir_path();
    let settings_path = data_dir.join("settings.json");

    if !settings_path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    // Try to parse as new format first
    let settings: AppSettings = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => {
            // Try to parse old format and migrate
            // Old format had only theme and version at root level
            #[derive(serde::Deserialize)]
            struct OldSettings {
                theme: Option<String>,
                version: Option<String>,
            }

            if let Ok(old) = serde_json::from_str::<OldSettings>(&content) {
                let mut settings = AppSettings::default();
                if let Some(theme) = old.theme {
                    settings.appearance.theme = theme;
                }
                settings
            } else {
                // Fallback to defaults if parsing fails completely
                AppSettings::default()
            }
        }
    };

    // Apply any necessary migrations
    let migrated = migrate_settings(settings);

    // Save migrated settings if version changed
    let _ = save_settings_internal(&migrated);

    Ok(migrated)
}

/// Internal function to save settings without going through tauri command
fn save_settings_internal(settings: &AppSettings) -> Result<(), String> {
    let data_dir = get_data_dir_path();

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;
    }

    let settings_path = data_dir.join("settings.json");
    let settings_json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, settings_json).map_err(|e| format!("Failed to write settings: {}", e))
}

/// Saves the application settings
///
/// Writes the full settings object to `data/settings.json` in a
/// human-readable, pretty-printed JSON format.
#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    save_settings_internal(&settings)
}

/// Updates a single setting value by key path
///
/// # Arguments
/// * `key` - Dot-separated path to the setting (e.g., "appearance.theme")
/// * `value` - JSON value to set
///
/// # Example
/// ```ignore
/// update_setting("appearance.theme", "\"dark\"")
/// update_setting("data.autoBackup", "true")
/// ```
#[tauri::command]
pub fn update_setting(key: String, value: String) -> Result<AppSettings, String> {
    let mut settings = get_settings()?;

    let parts: Vec<&str> = key.split('.').collect();

    match parts.as_slice() {
        ["appearance", "theme"] => {
            settings.appearance.theme =
                serde_json::from_str(&value).map_err(|e| format!("Invalid theme value: {}", e))?;
        }
        ["appearance", "accentColor"] => {
            settings.appearance.accent_color = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid accentColor value: {}", e))?;
        }
        ["appearance", "colorScheme"] => {
            settings.appearance.color_scheme = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid colorScheme value: {}", e))?;
        }
        ["data", "autoBackup"] => {
            settings.data.auto_backup = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid autoBackup value: {}", e))?;
        }
        ["data", "logLevel"] => {
            settings.data.log_level = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid logLevel value: {}", e))?;
        }
        ["application", "startMinimized"] => {
            settings.application.start_minimized = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid startMinimized value: {}", e))?;
        }
        ["application", "checkUpdates"] => {
            settings.application.check_updates = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid checkUpdates value: {}", e))?;
        }
        ["application", "confirmOnExit"] => {
            settings.application.confirm_on_exit = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid confirmOnExit value: {}", e))?;
        }
        _ => {
            return Err(format!("Unknown setting key: {}", key));
        }
    }

    save_settings_internal(&settings)?;
    Ok(settings)
}
