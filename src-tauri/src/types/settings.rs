//! Application settings types
//!
//! Hierarchical settings structure for scalability.
//! All settings are stored in `data/settings.json`.

use serde::{Deserialize, Serialize};

/// Current settings schema version for migration support
pub const SETTINGS_VERSION: &str = "0.4.0";

/// Appearance-related settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    /// User's theme mode preference: "light", "dark", or "system"
    pub theme: String,
    /// Color scheme: "default", "techbay", etc. (CSS class applied to html)
    #[serde(default = "default_color_scheme")]
    pub color_scheme: String,
}

fn default_color_scheme() -> String {
    String::from("default")
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: String::from("system"),
            color_scheme: String::from("default"),
        }
    }
}

/// Data and storage related settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSettings {
    /// Logging verbosity: "error", "warn", "info", "debug"
    pub log_level: String,
}

impl Default for DataSettings {
    fn default() -> Self {
        Self {
            log_level: String::from("info"),
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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: String::from(SETTINGS_VERSION),
            appearance: AppearanceSettings::default(),
            data: DataSettings::default(),
        }
    }
}

/// Migrate settings from older versions
pub fn migrate_settings(mut settings: AppSettings) -> AppSettings {
    if settings.version != SETTINGS_VERSION {
        settings.version = String::from(SETTINGS_VERSION);
    }

    // Ensure color_scheme has a valid default if empty
    if settings.appearance.color_scheme.is_empty() {
        settings.appearance.color_scheme = String::from("default");
    }

    settings
}
