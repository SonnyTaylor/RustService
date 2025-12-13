//! Application settings types

use serde::{Deserialize, Serialize};

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
