//! Service time tracking types
//!
//! Data structures for tracking service execution times and
//! predicting durations based on PC specifications.
//!
//! Enhanced with:
//! - Z-score normalization for feature scaling
//! - Ridge regression (L2 regularization) with weight clamping
//! - Time decay for recency bias
//! - Extended PC specs (power, AVX2, GPU, network, system load)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// =============================================================================
// PC Fingerprint (Enhanced)
// =============================================================================

/// Network connection type for I/O-bound task estimation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NetworkType {
    Ethernet,
    Wifi,
    Cellular,
    Unknown,
}

impl Default for NetworkType {
    fn default() -> Self {
        NetworkType::Unknown
    }
}

impl NetworkType {
    /// Convert to regression input value (higher = faster)
    pub fn to_score(&self) -> f64 {
        match self {
            NetworkType::Ethernet => 1.0,
            NetworkType::Wifi => 0.5,
            NetworkType::Cellular => 0.1,
            NetworkType::Unknown => 0.3,
        }
    }
}

/// Extended PC specifications for correlation with execution times
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcFingerprint {
    // === Core Specs ===
    /// Physical core count
    pub physical_cores: u32,
    /// Logical core count (includes hyperthreading)
    pub logical_cores: u32,
    /// CPU frequency in GHz
    pub frequency_ghz: f64,
    /// Computed CPU score: (physical * 1.0 + (logical - physical) * 0.3) * frequency
    pub cpu_score: f64,
    /// Available RAM in GB
    pub available_ram_gb: f64,
    /// Total RAM in GB
    pub total_ram_gb: f64,
    /// Whether the primary disk is SSD
    pub disk_is_ssd: bool,

    // === Extended Specs ===
    /// Is the system plugged in (AC power)?
    #[serde(default)]
    pub is_on_ac_power: bool,
    /// Does the CPU support AVX2 (modern architecture proxy)?
    #[serde(default)]
    pub has_avx2: bool,
    /// Is there a discrete GPU (NVIDIA/AMD)?
    #[serde(default)]
    pub has_discrete_gpu: bool,
    /// Network connection type
    #[serde(default)]
    pub network_type: NetworkType,
    /// Current CPU load percentage at time of capture (0-100)
    #[serde(default)]
    pub cpu_load_percent: f64,
}

impl Default for PcFingerprint {
    fn default() -> Self {
        Self {
            physical_cores: 4,
            logical_cores: 8,
            frequency_ghz: 2.0,
            cpu_score: 8.0,
            available_ram_gb: 8.0,
            total_ram_gb: 16.0,
            disk_is_ssd: true,
            is_on_ac_power: true,
            has_avx2: true,
            has_discrete_gpu: false,
            network_type: NetworkType::Unknown,
            cpu_load_percent: 20.0,
        }
    }
}

impl PcFingerprint {
    /// Calculate the CPU score using weighted hyperthreading formula
    pub fn compute_cpu_score(physical: u32, logical: u32, freq_ghz: f64) -> f64 {
        let physical_contribution = physical as f64;
        let ht_contribution = (logical.saturating_sub(physical)) as f64 * 0.3;
        (physical_contribution + ht_contribution) * freq_ghz
    }

    /// Get feature vector for regression (all normalized to ~0-1 range)
    pub fn to_feature_vector(&self) -> Vec<f64> {
        vec![
            self.cpu_score / 50.0,        // Normalize ~0-50 to ~0-1
            self.available_ram_gb / 64.0, // Normalize ~0-64GB to ~0-1
            if self.disk_is_ssd { 1.0 } else { 0.0 },
            if self.is_on_ac_power { 1.0 } else { 0.0 },
            if self.has_avx2 { 1.0 } else { 0.0 },
            if self.has_discrete_gpu { 1.0 } else { 0.0 },
            self.network_type.to_score(),
            self.cpu_load_percent / 100.0, // Raw load 0-1 (SGD will learn positive coefficient)
        ]
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
    /// Hash of service options (for settings-aware tracking)
    /// Different settings (e.g., ping count, stress duration) = different samples
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub options_hash: Option<String>,
}

// =============================================================================
// Regression Model (Enhanced with Ridge + Normalization)
// =============================================================================

/// Feature normalization statistics (mean/std for Z-score)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FeatureNormalization {
    pub means: Vec<f64>,
    pub std_devs: Vec<f64>,
}

/// Trained Ridge regression weights for a service
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServiceModelWeights {
    /// Y-intercept (base time in ms)
    pub intercept: f64,
    /// Feature coefficients (cpu, ram, ssd, power, avx2, gpu, network, load_inverse)
    pub coefficients: Vec<f64>,
    /// Number of samples used to train this model
    pub sample_count: usize,
    /// Normalization stats for applying Z-score at prediction time
    pub normalization: FeatureNormalization,
    /// Ridge regularization lambda used
    pub ridge_lambda: f64,
    /// R-squared score (model quality, 0-1)
    #[serde(default)]
    pub r_squared: f64,
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
    /// Average duration (outlier-filtered + time-decay weighted), ms
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
    /// Model quality score (R-squared, if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_quality: Option<f64>,
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

/// Metrics data file version (bumped for enhanced schema)
pub const METRICS_VERSION: &str = "2.0.0";

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
    /// Maximum samples to keep per service (rolling window)
    #[serde(default = "default_max_samples")]
    pub max_samples_per_service: usize,
    /// Samples since last retrain (per service) for batch retraining
    #[serde(default)]
    pub samples_since_retrain: HashMap<String, usize>,
    /// Number of samples to accumulate before retraining (batch size)
    #[serde(default = "default_retrain_batch")]
    pub retrain_batch_size: usize,
}

fn default_max_samples() -> usize {
    100
}

fn default_retrain_batch() -> usize {
    5
}

impl Default for ServiceTimeMetrics {
    fn default() -> Self {
        Self {
            version: String::from(METRICS_VERSION),
            samples: Vec::new(),
            models: HashMap::new(),
            max_samples_per_service: 100,
            samples_since_retrain: HashMap::new(),
            retrain_batch_size: 5,
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
