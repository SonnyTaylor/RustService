//! Application settings types
//!
//! Hierarchical settings structure for scalability.
//! All settings are stored in `data/settings.json`.

use serde::{Deserialize, Serialize};

/// Current settings schema version for migration support
pub const SETTINGS_VERSION: &str = "0.3.0";

/// Appearance-related settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    /// User's theme mode preference: "light", "dark", or "system"
    pub theme: String,
    /// Color scheme: "default", "techbay", etc. (CSS class applied to html)
    #[serde(default = "default_color_scheme")]
    pub color_scheme: String,
    /// Accent color for UI elements (hex format) - legacy, prefer color_scheme
    pub accent_color: String,
}

fn default_color_scheme() -> String {
    String::from("default")
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: String::from("system"),
            color_scheme: String::from("default"),
            accent_color: String::from("#3b82f6"),
        }
    }
}

/// Data and storage related settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSettings {
    /// Enable automatic settings backup
    pub auto_backup: bool,
    /// Logging verbosity: "error", "warn", "info", "debug"
    pub log_level: String,
}

impl Default for DataSettings {
    fn default() -> Self {
        Self {
            auto_backup: false,
            log_level: String::from("info"),
        }
    }
}

/// Application behavior settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationSettings {
    /// Start the application minimized to tray
    pub start_minimized: bool,
    /// Check for updates on startup
    pub check_updates: bool,
    /// Confirm before closing the application
    pub confirm_on_exit: bool,
}

impl Default for ApplicationSettings {
    fn default() -> Self {
        Self {
            start_minimized: false,
            check_updates: true,
            confirm_on_exit: false,
        }
    }
}

/// Main application settings schema
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// Settings schema version for migration
    pub version: String,
    /// Appearance settings (theme, colors)
    #[serde(default)]
    pub appearance: AppearanceSettings,
    /// Data and storage settings
    #[serde(default)]
    pub data: DataSettings,
    /// Application behavior settings
    #[serde(default)]
    pub application: ApplicationSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: String::from(SETTINGS_VERSION),
            appearance: AppearanceSettings::default(),
            data: DataSettings::default(),
            application: ApplicationSettings::default(),
        }
    }
}

/// Migrate settings from older versions
pub fn migrate_settings(mut settings: AppSettings) -> AppSettings {
    // Handle migration from older versions
    // serde will use defaults for missing nested fields

    if settings.version != SETTINGS_VERSION {
        settings.version = String::from(SETTINGS_VERSION);
    }

    // Ensure color_scheme has a valid default if empty
    if settings.appearance.color_scheme.is_empty() {
        settings.appearance.color_scheme = String::from("default");
    }

    settings
}
