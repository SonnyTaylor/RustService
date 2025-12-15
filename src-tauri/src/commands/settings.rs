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

    // Try to parse, falling back to defaults for missing fields
    let settings: AppSettings = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(_) => {
            // Try to parse old format and migrate
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct OldSettings {
                theme: Option<String>,
                #[serde(default)]
                appearance: Option<OldAppearance>,
            }
            #[derive(serde::Deserialize, Default)]
            #[serde(rename_all = "camelCase")]
            struct OldAppearance {
                theme: Option<String>,
                color_scheme: Option<String>,
            }

            if let Ok(old) = serde_json::from_str::<OldSettings>(&content) {
                let mut settings = AppSettings::default();
                // Handle old root-level theme
                if let Some(theme) = old.theme {
                    settings.appearance.theme = theme;
                }
                // Handle nested appearance
                if let Some(appearance) = old.appearance {
                    if let Some(theme) = appearance.theme {
                        settings.appearance.theme = theme;
                    }
                    if let Some(scheme) = appearance.color_scheme {
                        settings.appearance.color_scheme = scheme;
                    }
                }
                settings
            } else {
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
#[tauri::command]
pub fn update_setting(key: String, value: String) -> Result<AppSettings, String> {
    let mut settings = get_settings()?;

    let parts: Vec<&str> = key.split('.').collect();

    match parts.as_slice() {
        ["appearance", "theme"] => {
            settings.appearance.theme =
                serde_json::from_str(&value).map_err(|e| format!("Invalid theme value: {}", e))?;
        }
        ["appearance", "colorScheme"] => {
            settings.appearance.color_scheme = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid colorScheme value: {}", e))?;
        }
        ["data", "logLevel"] => {
            settings.data.log_level = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid logLevel value: {}", e))?;
        }
        ["reports", "autoSaveReports"] => {
            settings.reports.auto_save_reports = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid autoSaveReports value: {}", e))?;
        }
        ["reports", "reportRetentionDays"] => {
            settings.reports.report_retention_days = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid reportRetentionDays value: {}", e))?;
        }
        ["reports", "includeLogsInReport"] => {
            settings.reports.include_logs_in_report = serde_json::from_str(&value)
                .map_err(|e| format!("Invalid includeLogsInReport value: {}", e))?;
        }
        _ => {
            return Err(format!("Unknown setting key: {}", key));
        }
    }

    save_settings_internal(&settings)?;
    Ok(settings)
}
