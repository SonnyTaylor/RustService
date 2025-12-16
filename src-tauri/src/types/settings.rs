//! Application settings types
//!
//! Hierarchical settings structure for scalability.
//! All settings are stored in `data/settings.json`.

use serde::{Deserialize, Serialize};

use crate::types::service::ServicePreset;

/// Current settings schema version for migration support
pub const SETTINGS_VERSION: &str = "0.6.0";

/// Appearance-related settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    /// User's theme mode preference: "light", "dark", or "system"
    pub theme: String,
    /// Color scheme: "default", "techbay", etc. (CSS class applied to html)
    #[serde(default = "default_color_scheme")]
    pub color_scheme: String,
    /// Whether animations are enabled
    #[serde(default = "default_animations_enabled")]
    pub enable_animations: bool,
}

fn default_color_scheme() -> String {
    String::from("default")
}

fn default_animations_enabled() -> bool {
    true
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: String::from("system"),
            color_scheme: String::from("default"),
            enable_animations: true,
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

/// Report-related settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportsSettings {
    /// Whether to automatically save reports when services complete
    #[serde(default = "default_auto_save")]
    pub auto_save_reports: bool,
    /// Number of days to retain reports (0 = keep forever)
    #[serde(default)]
    pub report_retention_days: u32,
    /// Whether to include detailed logs in saved reports
    #[serde(default = "default_include_logs")]
    pub include_logs_in_report: bool,
}

fn default_auto_save() -> bool {
    true
}

fn default_include_logs() -> bool {
    true
}

impl Default for ReportsSettings {
    fn default() -> Self {
        Self {
            auto_save_reports: true,
            report_retention_days: 0,
            include_logs_in_report: true,
        }
    }
}

/// Business branding and technician settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BusinessSettings {
    /// Whether business mode is enabled
    #[serde(default)]
    pub enabled: bool,
    /// Business name
    #[serde(default)]
    pub name: String,
    /// Business logo path (relative to data dir)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_path: Option<String>,
    /// Street address
    #[serde(default)]
    pub address: String,
    /// Phone number
    #[serde(default)]
    pub phone: String,
    /// Email address
    #[serde(default)]
    pub email: String,
    /// Website URL
    #[serde(default)]
    pub website: String,
    /// Tax File Number (Australian)
    #[serde(default)]
    pub tfn: String,
    /// Australian Business Number
    #[serde(default)]
    pub abn: String,
    /// List of technician names
    #[serde(default)]
    pub technicians: Vec<String>,
}

/// Required program path overrides
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProgramsSettings {
    /// Custom path overrides for required programs (keyed by program ID)
    #[serde(default)]
    pub overrides: std::collections::HashMap<String, String>,
}

/// A single technician tab configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechnicianTab {
    /// Unique identifier for the tab
    pub id: String,
    /// Display name shown in the tab bar
    pub name: String,
    /// URL to load in the iframe
    pub url: String,
    /// Icon to display (preset icon name, or None for favicon)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

/// Technician tabs settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TechnicianTabsSettings {
    /// List of custom technician tabs
    #[serde(default)]
    pub tabs: Vec<TechnicianTab>,
    /// Whether to use website favicons for tab icons
    #[serde(default = "default_use_favicons")]
    pub use_favicons: bool,
}

fn default_use_favicons() -> bool {
    true
}

/// Service presets settings (custom presets)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PresetsSettings {
    /// Custom service presets created or modified by the user
    #[serde(default)]
    pub custom_presets: Vec<ServicePreset>,
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
    /// Report settings
    #[serde(default)]
    pub reports: ReportsSettings,
    /// Business branding and technician settings
    #[serde(default)]
    pub business: BusinessSettings,
    /// Required program path overrides
    #[serde(default)]
    pub programs: ProgramsSettings,
    /// Custom technician tabs for embedding external websites
    #[serde(default)]
    pub technician_tabs: TechnicianTabsSettings,
    /// Custom service presets
    #[serde(default)]
    pub presets: PresetsSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: String::from(SETTINGS_VERSION),
            appearance: AppearanceSettings::default(),
            data: DataSettings::default(),
            reports: ReportsSettings::default(),
            business: BusinessSettings::default(),
            programs: ProgramsSettings::default(),
            technician_tabs: TechnicianTabsSettings::default(),
            presets: PresetsSettings::default(),
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
