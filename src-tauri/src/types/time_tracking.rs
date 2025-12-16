//! Service time tracking types
//!
//! Data structures for tracking service execution times and
//! predicting durations based on PC specifications.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// =============================================================================
// PC Fingerprint
// =============================================================================

/// Normalized PC specifications for correlation with execution times
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcFingerprint {
    /// CPU score: physical_cores * (frequency_mhz / 1000)
    pub cpu_score: f64,
    /// Available RAM in GB
    pub ram_gb: f64,
    /// Whether the primary disk is SSD (affects I/O-bound tasks)
    pub disk_is_ssd: bool,
    /// Total RAM in GB (for normalization)
    pub total_ram_gb: f64,
}

impl Default for PcFingerprint {
    fn default() -> Self {
        Self {
            cpu_score: 8.0, // Assume quad-core at 2GHz
            ram_gb: 8.0,
            disk_is_ssd: true,
            total_ram_gb: 16.0,
        }
    }
}

// =============================================================================
// Time Samples
// =============================================================================

/// A single recorded service execution time
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceTimeSample {
    /// Service that was run
    pub service_id: String,
    /// Execution duration in milliseconds
    pub duration_ms: u64,
    /// When this sample was recorded (ISO 8601)
    pub timestamp: String,
    /// PC specs at time of execution
    pub pc_fingerprint: PcFingerprint,
    /// Preset ID used (if any) for per-preset tracking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preset_id: Option<String>,
}

// =============================================================================
// Regression Model
// =============================================================================

/// Trained linear regression weights for a service
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServiceModelWeights {
    /// Y-intercept (base time in ms)
    pub intercept: f64,
    /// CPU score coefficient (ms per score unit)
    pub cpu_coef: f64,
    /// RAM coefficient (ms per GB)
    pub ram_coef: f64,
    /// SSD bonus (ms reduction when SSD=true)
    pub ssd_coef: f64,
    /// Number of samples used to train this model
    pub sample_count: usize,
}

// =============================================================================
// Per-Service Statistics
// =============================================================================

/// Aggregated statistics for a single service
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceTimeStats {
    /// Service ID
    pub service_id: String,
    /// Average duration (outlier-filtered), ms
    pub average_ms: f64,
    /// Minimum recorded duration, ms
    pub min_ms: u64,
    /// Maximum recorded duration, ms
    pub max_ms: u64,
    /// Median duration, ms
    pub median_ms: u64,
    /// Number of samples
    pub sample_count: usize,
    /// Standard deviation, ms
    pub std_dev_ms: f64,
    /// Confidence level: "low" (1-2), "medium" (3-4), "high" (5+)
    pub confidence: String,
    /// Estimated duration for current PC (if model trained)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_ms: Option<u64>,
}

// =============================================================================
// Per-Preset Statistics
// =============================================================================

/// Aggregated statistics for a preset
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetTimeStats {
    /// Preset ID
    pub preset_id: String,
    /// Average total duration, ms  
    pub average_ms: f64,
    /// Minimum total duration, ms
    pub min_ms: u64,
    /// Maximum total duration, ms
    pub max_ms: u64,
    /// Number of complete runs
    pub run_count: usize,
    /// Confidence level
    pub confidence: String,
}

// =============================================================================
// Main Metrics Structure
// =============================================================================

/// Metrics data file version
pub const METRICS_VERSION: &str = "1.0.0";

/// Complete service time metrics data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceTimeMetrics {
    /// Schema version for migration
    pub version: String,
    /// All recorded time samples
    pub samples: Vec<ServiceTimeSample>,
    /// Trained regression models per service
    pub models: HashMap<String, ServiceModelWeights>,
    /// Maximum samples to keep per service (for memory management)
    #[serde(default = "default_max_samples")]
    pub max_samples_per_service: usize,
}

fn default_max_samples() -> usize {
    100
}

impl Default for ServiceTimeMetrics {
    fn default() -> Self {
        Self {
            version: String::from(METRICS_VERSION),
            samples: Vec::new(),
            models: HashMap::new(),
            max_samples_per_service: 100,
        }
    }
}

// =============================================================================
// Settings Integration
// =============================================================================

/// Service metrics settings (for user preferences)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceMetricsSettings {
    /// Whether to collect timing data
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// Show estimated times in queue view
    #[serde(default = "default_show_estimates")]
    pub show_estimates: bool,
    /// Maximum samples to retain per service
    #[serde(default = "default_max_samples")]
    pub max_samples_per_service: usize,
}

fn default_enabled() -> bool {
    true
}

fn default_show_estimates() -> bool {
    true
}

impl Default for ServiceMetricsSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            show_estimates: true,
            max_samples_per_service: 100,
        }
    }
}
