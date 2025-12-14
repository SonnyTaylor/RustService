//! Program type definitions
//!
//! Types for managing portable programs in the data folder.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Represents a portable program managed by RustService
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Program {
    /// Unique identifier for the program
    pub id: String,
    /// Display name
    pub name: String,
    /// Description of what the program does
    pub description: String,
    /// Version string (user-provided)
    pub version: String,
    /// Absolute path to the executable
    pub exe_path: String,
    /// Path to extracted/custom icon (relative to data folder)
    pub icon_path: Option<String>,
    /// Whether this is a CLI-only tool (cannot be launched from GUI)
    pub is_cli: bool,
    /// Number of times this program has been launched
    pub launch_count: u32,
    /// When the program was added
    pub created_at: DateTime<Utc>,
    /// Last time the program was launched
    pub last_launched: Option<DateTime<Utc>>,
}

impl Program {
    /// Create a new program with default values
    pub fn new(
        name: String,
        description: String,
        version: String,
        exe_path: String,
        is_cli: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            version,
            exe_path,
            icon_path: None,
            is_cli,
            launch_count: 0,
            created_at: Utc::now(),
            last_launched: None,
        }
    }
}

/// Configuration for all programs, stored in data/programs.json
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProgramConfig {
    /// List of all managed programs
    pub programs: Vec<Program>,
}
