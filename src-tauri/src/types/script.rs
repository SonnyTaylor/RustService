//! Script type definitions
//!
//! Types for managing scripts that can be executed via PowerShell or CMD.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Type of script interpreter
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ScriptType {
    /// PowerShell script
    PowerShell,
    /// CMD/Batch script
    Cmd,
}

impl Default for ScriptType {
    fn default() -> Self {
        Self::PowerShell
    }
}

/// Represents a saved script managed by RustService
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Script {
    /// Unique identifier for the script
    pub id: String,
    /// Display name
    pub name: String,
    /// Description of what the script does
    pub description: String,
    /// Type of script interpreter (PowerShell or CMD)
    pub script_type: ScriptType,
    /// The actual script content/code
    pub content: String,
    /// Whether this script should run with admin privileges
    pub run_as_admin: bool,
    /// Number of times this script has been executed
    pub run_count: u32,
    /// When the script was added
    pub created_at: DateTime<Utc>,
    /// Last time the script was executed
    pub last_run: Option<DateTime<Utc>>,
}

impl Script {
    /// Create a new script with default values
    pub fn new(
        name: String,
        description: String,
        script_type: ScriptType,
        content: String,
        run_as_admin: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            script_type,
            content,
            run_as_admin,
            run_count: 0,
            created_at: Utc::now(),
            last_run: None,
        }
    }
}

/// Configuration for all scripts, stored in data/scripts.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScriptConfig {
    /// List of all managed scripts
    pub scripts: Vec<Script>,
}
