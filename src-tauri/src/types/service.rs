//! Service system type definitions
//!
//! Types for the modular service automation system.
//! Services run diagnostic and maintenance tasks on the system.

use serde::{Deserialize, Serialize};

// =============================================================================
// Service Identification
// =============================================================================

/// Unique identifier for a service
pub type ServiceId = String;

/// Unique identifier for a service run/report
pub type ReportId = String;

// =============================================================================
// Service Definitions
// =============================================================================

/// Schema for a service option field
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceOptionSchema {
    /// Option identifier
    pub id: String,
    /// Display label
    pub label: String,
    /// Option type: "number", "string", "boolean", "select"
    pub option_type: String,
    /// Default value (JSON encoded)
    pub default_value: serde_json::Value,
    /// For number type: minimum value
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    /// For number type: maximum value
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    /// For select type: available options
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<SelectOption>>,
    /// Help text for the option
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Option for select-type service options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}

/// Definition of a service that can be run
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDefinition {
    /// Unique service identifier
    pub id: ServiceId,
    /// Display name
    pub name: String,
    /// Description of what the service does
    pub description: String,
    /// Category for grouping (e.g., "diagnostics", "cleanup", "security")
    pub category: String,
    /// Estimated duration in seconds (for progress estimation)
    pub estimated_duration_secs: u32,
    /// Program IDs required to run this service (from programs.json)
    /// Empty vec means no external programs needed
    pub required_programs: Vec<String>,
    /// Configurable options for this service
    pub options: Vec<ServiceOptionSchema>,
    /// Icon name (lucide icon identifier)
    pub icon: String,
}

// =============================================================================
// Service Presets
// =============================================================================

/// A preset configuration of services
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServicePreset {
    /// Preset identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Description
    pub description: String,
    /// Services included in this preset (with default options)
    pub services: Vec<PresetServiceConfig>,
    /// Icon name
    pub icon: String,
    /// Accent color for the card
    pub color: String,
}

/// Service configuration within a preset
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetServiceConfig {
    /// Service ID
    pub service_id: ServiceId,
    /// Whether enabled by default in this preset
    pub enabled: bool,
    /// Default options for this service in the preset
    pub options: serde_json::Value,
}

// =============================================================================
// Service Queue
// =============================================================================

/// An item in the service run queue
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceQueueItem {
    /// Service ID
    pub service_id: ServiceId,
    /// Whether this service is enabled for the run
    pub enabled: bool,
    /// Order in the queue (0-indexed)
    pub order: u32,
    /// User-configured options
    pub options: serde_json::Value,
}

// =============================================================================
// Service Results
// =============================================================================

/// Severity level for a finding
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FindingSeverity {
    Info,
    Success,
    Warning,
    Error,
    Critical,
}

/// A single finding from a service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceFinding {
    /// Severity level
    pub severity: FindingSeverity,
    /// Short title
    pub title: String,
    /// Detailed description
    pub description: String,
    /// Recommended action (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendation: Option<String>,
    /// Raw data (for technical details)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Result of running a single service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceResult {
    /// Service ID that was run
    pub service_id: ServiceId,
    /// Whether the service completed successfully
    pub success: bool,
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Execution time in milliseconds
    pub duration_ms: u64,
    /// Findings from the service
    pub findings: Vec<ServiceFinding>,
    /// Log output from the service
    pub logs: Vec<String>,
}

/// Status of a service run
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ServiceRunStatus {
    /// Run is queued but not started
    Pending,
    /// Currently running
    Running,
    /// Completed successfully
    Completed,
    /// Failed with error
    Failed,
    /// Cancelled by user
    Cancelled,
}

/// A complete service run report
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceReport {
    /// Unique report ID
    pub id: ReportId,
    /// When the run started (ISO string)
    pub started_at: String,
    /// When the run completed (ISO string, null if still running)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    /// Overall status
    pub status: ServiceRunStatus,
    /// Total duration in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_duration_ms: Option<u64>,
    /// Queue that was run
    pub queue: Vec<ServiceQueueItem>,
    /// Results for each service (keyed by service_id)
    pub results: Vec<ServiceResult>,
    /// Index of currently running service (for progress)
    pub current_service_index: Option<usize>,
    /// Technician who performed the service (business mode)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub technician_name: Option<String>,
    /// Customer name (business mode)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customer_name: Option<String>,
}

// =============================================================================
// Service Run State (for persistent running across tab navigation)
// =============================================================================

/// Global service run state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceRunState {
    /// Whether a service run is currently active
    pub is_running: bool,
    /// Current report being generated
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_report: Option<ServiceReport>,
}

impl Default for ServiceRunState {
    fn default() -> Self {
        Self {
            is_running: false,
            current_report: None,
        }
    }
}
