//! Service time tracking commands
//!
//! Tauri commands for recording, analyzing, and estimating service execution times.
//!
//! Enhanced with:
//! - Z-score normalization for feature scaling
//! - Ridge regression (L2 regularization) with weight clamping
//! - Time decay (exponential weighting for recency bias)
//! - Batch retraining (every N samples, not per-write)
//! - Extended PC specs (power, AVX2, GPU, network, system load)

use std::collections::HashMap;
use std::fs;
use std::sync::{Mutex, OnceLock};

use chrono::{DateTime, Utc};
use sysinfo::{Disks, Networks, System};

use super::data_dir::get_data_dir_path;
use crate::types::{
    FeatureNormalization, NetworkType, PcFingerprint, PresetTimeStats, ServiceModelWeights,
    ServiceTimeMetrics, ServiceTimeSample, ServiceTimeStats,
};

// =============================================================================
// Constants
// =============================================================================

/// Ridge regularization parameter (prevents overfitting and multicollinearity)
const RIDGE_LAMBDA: f64 = 0.1;

/// Time decay base (0.95^days_old means ~60% weight after 10 days)
const TIME_DECAY_BASE: f64 = 0.95;

/// Number of features in the fingerprint vector
const NUM_FEATURES: usize = 8;

// =============================================================================
// Metrics File Management
// =============================================================================

static METRICS_CACHE: OnceLock<Mutex<ServiceTimeMetrics>> = OnceLock::new();

fn get_metrics_path() -> std::path::PathBuf {
    get_data_dir_path().join("service_metrics.json")
}

fn load_metrics() -> ServiceTimeMetrics {
    let path = get_metrics_path();
    if path.exists() {
        if let Ok(json) = fs::read_to_string(&path) {
            if let Ok(metrics) = serde_json::from_str(&json) {
                return metrics;
            }
        }
    }
    ServiceTimeMetrics::default()
}

fn save_metrics(metrics: &ServiceTimeMetrics) -> Result<(), String> {
    let path = get_metrics_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(metrics)
        .map_err(|e| format!("Failed to serialize metrics: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write metrics: {}", e))
}

fn get_cached_metrics() -> &'static Mutex<ServiceTimeMetrics> {
    METRICS_CACHE.get_or_init(|| Mutex::new(load_metrics()))
}

// =============================================================================
// PC Fingerprint Generation (Enhanced)
// =============================================================================

/// Generate an extended PC fingerprint with all specs
fn generate_pc_fingerprint() -> PcFingerprint {
    let mut sys = System::new_all();
    sys.refresh_all();

    // CPU cores and frequency
    let physical_cores = System::physical_core_count().unwrap_or(4) as u32;
    let logical_cores = sys.cpus().len() as u32;
    let frequency_ghz = sys
        .cpus()
        .first()
        .map(|c| c.frequency() as f64 / 1000.0)
        .unwrap_or(2.0);

    // Calculate weighted CPU score
    let cpu_score = PcFingerprint::compute_cpu_score(physical_cores, logical_cores, frequency_ghz);

    // RAM
    let total_ram_gb = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    let available_ram_gb = sys.available_memory() as f64 / (1024.0 * 1024.0 * 1024.0);

    // Current CPU load
    let cpu_load_percent = sys.global_cpu_usage() as f64;

    // Disk type (check primary/largest disk)
    let disk_list = Disks::new_with_refreshed_list();
    let disk_is_ssd = disk_list
        .iter()
        .max_by_key(|d| d.total_space())
        .map(|d| format!("{:?}", d.kind()).to_lowercase().contains("ssd"))
        .unwrap_or(true);

    // Power source - check if any battery is discharging
    let is_on_ac_power = battery::Manager::new()
        .ok()
        .and_then(|m| m.batteries().ok())
        .map(|mut batteries| {
            batteries.all(|b| {
                b.map(|batt| batt.state() != battery::State::Discharging)
                    .unwrap_or(true)
            })
        })
        .unwrap_or(true); // Default to AC if no battery

    // AVX2 support - use raw_cpuid if available, otherwise assume modern
    let has_avx2 = {
        #[cfg(target_arch = "x86_64")]
        {
            std::arch::is_x86_feature_detected!("avx2")
        }
        #[cfg(not(target_arch = "x86_64"))]
        {
            false
        }
    };

    // Discrete GPU detection
    let has_discrete_gpu = match gfxinfo::active_gpu() {
        Ok(gpu) => {
            let vendor = gpu.vendor().to_lowercase();
            vendor.contains("nvidia") || vendor.contains("amd") || vendor.contains("radeon")
        }
        Err(_) => false,
    };

    // Network type detection
    let network_type = detect_network_type();

    PcFingerprint {
        physical_cores,
        logical_cores,
        frequency_ghz,
        cpu_score,
        available_ram_gb,
        total_ram_gb,
        disk_is_ssd,
        is_on_ac_power,
        has_avx2,
        has_discrete_gpu,
        network_type,
        cpu_load_percent,
    }
}

/// Detect the primary network connection type
fn detect_network_type() -> NetworkType {
    let networks = Networks::new_with_refreshed_list();

    // Find the interface with most traffic (likely active)
    let active_interface = networks
        .iter()
        .filter(|(name, _)| {
            let n = name.to_lowercase();
            !n.contains("loopback") && !n.contains("docker") && !n.contains("veth")
        })
        .max_by_key(|(_, data)| data.total_received() + data.total_transmitted());

    if let Some((name, _)) = active_interface {
        let lower = name.to_lowercase();
        if lower.contains("eth") || lower.contains("en0") || lower.contains("ethernet") {
            NetworkType::Ethernet
        } else if lower.contains("wlan")
            || lower.contains("wi-fi")
            || lower.contains("wifi")
            || lower.contains("wl")
        {
            NetworkType::Wifi
        } else if lower.contains("cellular") || lower.contains("wwan") {
            NetworkType::Cellular
        } else {
            NetworkType::Unknown
        }
    } else {
        NetworkType::Unknown
    }
}

// =============================================================================
// Z-Score Normalization
// =============================================================================

/// Calculate mean and standard deviation for each feature
fn calculate_normalization(samples: &[ServiceTimeSample]) -> FeatureNormalization {
    if samples.is_empty() {
        return FeatureNormalization {
            means: vec![0.0; NUM_FEATURES],
            std_devs: vec![1.0; NUM_FEATURES],
        };
    }

    let n = samples.len() as f64;
    let mut sums = vec![0.0; NUM_FEATURES];
    let mut sq_sums = vec![0.0; NUM_FEATURES];

    for sample in samples {
        let features = sample.pc_fingerprint.to_feature_vector();
        for (i, &v) in features.iter().enumerate() {
            sums[i] += v;
            sq_sums[i] += v * v;
        }
    }

    let means: Vec<f64> = sums.iter().map(|&s| s / n).collect();
    let std_devs: Vec<f64> = sq_sums
        .iter()
        .zip(means.iter())
        .map(|(&sq, &mean)| {
            let variance = (sq / n) - (mean * mean);
            // Avoid division by zero
            if variance > 0.0001 {
                variance.sqrt()
            } else {
                1.0
            }
        })
        .collect();

    FeatureNormalization { means, std_devs }
}

/// Apply Z-score normalization to a feature vector
fn normalize_features(features: &[f64], norm: &FeatureNormalization) -> Vec<f64> {
    features
        .iter()
        .zip(norm.means.iter())
        .zip(norm.std_devs.iter())
        .map(|((&x, &mean), &std)| (x - mean) / std)
        .collect()
}

// =============================================================================
// Time Decay Weighting
// =============================================================================

/// Calculate time decay weight for a sample based on age
fn calculate_time_decay(timestamp: &str) -> f64 {
    let sample_time = DateTime::parse_from_rfc3339(timestamp)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    let days_old = (Utc::now() - sample_time).num_days().max(0) as f64;

    // Exponential decay: 0.95^days
    TIME_DECAY_BASE.powf(days_old)
}

// =============================================================================
// Ridge Regression with Weight Clamping
// =============================================================================

/// Train a Ridge regression model with L2 regularization
/// Uses weighted least squares with time decay
fn train_ridge_regression(samples: &[ServiceTimeSample]) -> Option<ServiceModelWeights> {
    if samples.len() < 5 {
        return None;
    }

    // Calculate normalization stats
    let normalization = calculate_normalization(samples);

    // Prepare data with time decay weights
    let mut x_matrix: Vec<Vec<f64>> = Vec::new();
    let mut y_values: Vec<f64> = Vec::new();
    let mut weights: Vec<f64> = Vec::new();

    for sample in samples {
        let raw_features = sample.pc_fingerprint.to_feature_vector();
        let normalized = normalize_features(&raw_features, &normalization);
        x_matrix.push(normalized);
        y_values.push(sample.duration_ms as f64);
        weights.push(calculate_time_decay(&sample.timestamp));
    }

    let n = samples.len();

    // Calculate weighted means
    let total_weight: f64 = weights.iter().sum();
    let y_mean: f64 = y_values
        .iter()
        .zip(weights.iter())
        .map(|(y, w)| y * w)
        .sum::<f64>()
        / total_weight;

    // Simple closed-form Ridge regression for each coefficient
    // β_j = (Σ w_i * x_ij * (y_i - ȳ)) / (Σ w_i * x_ij² + λ)
    let mut coefficients = vec![0.0; NUM_FEATURES];

    for j in 0..NUM_FEATURES {
        let mut numerator = 0.0;
        let mut denominator = RIDGE_LAMBDA; // Start with regularization term

        for i in 0..n {
            let x_ij = x_matrix[i][j];
            let y_i = y_values[i];
            let w_i = weights[i];

            numerator += w_i * x_ij * (y_i - y_mean);
            denominator += w_i * x_ij * x_ij;
        }

        coefficients[j] = numerator / denominator;
    }

    // Apply weight clamping: CPU, RAM, AVX2 should generally reduce time (negative coefficients)
    // SSD, AC power, discrete GPU should reduce time (negative coefficients)
    // High load should increase time (positive when inverted, so coefficient can be negative)
    // Clamp to reasonable ranges to prevent wild predictions
    for (_i, coef) in coefficients.iter_mut().enumerate() {
        // Features that should reduce time: clamp to non-positive
        // CPU (0), RAM (1), SSD (2), Power (3), AVX2 (4), GPU (5), Network (6), LoadInverse (7)
        // All should reduce time (faster PC = lower duration), so coefficients should be <= 0
        *coef = coef.clamp(-100000.0, 0.0);
    }

    // Calculate intercept (base time at mean feature values)
    let intercept = y_mean;

    // Calculate R-squared
    let ss_tot: f64 = y_values
        .iter()
        .zip(weights.iter())
        .map(|(y, w)| w * (y - y_mean).powi(2))
        .sum();

    let mut ss_res = 0.0;
    for i in 0..n {
        let predicted = intercept
            + x_matrix[i]
                .iter()
                .zip(coefficients.iter())
                .map(|(x, c)| x * c)
                .sum::<f64>();
        ss_res += weights[i] * (y_values[i] - predicted).powi(2);
    }

    let r_squared = if ss_tot > 0.0 {
        (1.0 - ss_res / ss_tot).clamp(0.0, 1.0)
    } else {
        0.0
    };

    Some(ServiceModelWeights {
        intercept,
        coefficients,
        sample_count: n,
        normalization,
        ridge_lambda: RIDGE_LAMBDA,
        r_squared,
    })
}

/// Predict duration using trained model
fn predict_duration(weights: &ServiceModelWeights, fingerprint: &PcFingerprint) -> u64 {
    let raw_features = fingerprint.to_feature_vector();
    let normalized = normalize_features(&raw_features, &weights.normalization);

    let prediction = weights.intercept
        + normalized
            .iter()
            .zip(weights.coefficients.iter())
            .map(|(x, c)| x * c)
            .sum::<f64>();

    // Clamp to reasonable range (1 second to 1 hour)
    prediction.max(1000.0).min(3_600_000.0) as u64
}

// =============================================================================
// IQR-Based Outlier Filtering (with Time Decay)
// =============================================================================

/// Calculate IQR-filtered, time-decay-weighted average
fn calculate_weighted_stats(samples: &[ServiceTimeSample]) -> (f64, u64, u64, u64, f64) {
    if samples.is_empty() {
        return (0.0, 0, 0, 0, 0.0);
    }

    let mut weighted_pairs: Vec<(u64, f64)> = samples
        .iter()
        .map(|s| (s.duration_ms, calculate_time_decay(&s.timestamp)))
        .collect();

    // Sort by duration for IQR
    weighted_pairs.sort_by_key(|(d, _)| *d);

    let len = weighted_pairs.len();
    let min = weighted_pairs[0].0;
    let max = weighted_pairs[len - 1].0;
    let median = weighted_pairs[len / 2].0;

    // IQR filtering (only if 4+ samples)
    let filtered_pairs = if len >= 4 {
        let q1_idx = len / 4;
        let q3_idx = (3 * len) / 4;
        let q1 = weighted_pairs[q1_idx].0 as f64;
        let q3 = weighted_pairs[q3_idx].0 as f64;
        let iqr = q3 - q1;

        let lower = (q1 - 1.5 * iqr).max(0.0);
        let upper = q3 + 1.5 * iqr;

        weighted_pairs
            .into_iter()
            .filter(|(d, _)| (*d as f64) >= lower && (*d as f64) <= upper)
            .collect::<Vec<_>>()
    } else {
        weighted_pairs
    };

    if filtered_pairs.is_empty() {
        return (median as f64, min, max, median, 0.0);
    }

    // Weighted average
    let total_weight: f64 = filtered_pairs.iter().map(|(_, w)| w).sum();
    let weighted_avg: f64 = filtered_pairs
        .iter()
        .map(|(d, w)| (*d as f64) * w)
        .sum::<f64>()
        / total_weight;

    // Weighted standard deviation
    let variance: f64 = filtered_pairs
        .iter()
        .map(|(d, w)| w * (*d as f64 - weighted_avg).powi(2))
        .sum::<f64>()
        / total_weight;

    (weighted_avg, min, max, median, variance.sqrt())
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Get all service time metrics
#[tauri::command]
pub fn get_service_time_metrics() -> ServiceTimeMetrics {
    let metrics = get_cached_metrics().lock().unwrap();
    metrics.clone()
}

/// Record a service execution time (with batch retraining)
#[tauri::command]
pub fn record_service_time(
    service_id: String,
    duration_ms: u64,
    preset_id: Option<String>,
) -> Result<(), String> {
    let mut metrics = get_cached_metrics().lock().unwrap();

    let sample = ServiceTimeSample {
        service_id: service_id.clone(),
        duration_ms,
        timestamp: Utc::now().to_rfc3339(),
        pc_fingerprint: generate_pc_fingerprint(),
        preset_id,
    };

    metrics.samples.push(sample);

    // Trim old samples (rolling window per service)
    let max_per_service = metrics.max_samples_per_service;
    let service_count = metrics
        .samples
        .iter()
        .filter(|s| s.service_id == service_id)
        .count();

    if service_count > max_per_service {
        let excess = service_count - max_per_service;
        let mut removed = 0;
        metrics.samples.retain(|s| {
            if s.service_id == service_id && removed < excess {
                removed += 1;
                false
            } else {
                true
            }
        });
    }

    // Batch retraining: read batch_size before getting mutable ref to counter
    let batch_size = metrics.retrain_batch_size;

    // Increment samples since retrain counter
    let counter = metrics
        .samples_since_retrain
        .entry(service_id.clone())
        .or_insert(0);
    *counter += 1;

    // Only retrain if we've accumulated enough samples
    if *counter >= batch_size {
        *counter = 0;

        // Get samples for this service
        let service_samples: Vec<_> = metrics
            .samples
            .iter()
            .filter(|s| s.service_id == service_id)
            .cloned()
            .collect();

        if let Some(weights) = train_ridge_regression(&service_samples) {
            metrics.models.insert(service_id, weights);
        }
    }

    save_metrics(&metrics)?;
    Ok(())
}

/// Get the current PC fingerprint
#[tauri::command]
pub fn get_pc_fingerprint() -> PcFingerprint {
    generate_pc_fingerprint()
}

/// Get estimated time for a service on the current PC
#[tauri::command]
pub fn get_estimated_time(service_id: String, default_secs: u32) -> u64 {
    let metrics = get_cached_metrics().lock().unwrap();
    let fingerprint = generate_pc_fingerprint();

    // Try using trained model first
    if let Some(weights) = metrics.models.get(&service_id) {
        if weights.sample_count >= 5 {
            return predict_duration(weights, &fingerprint);
        }
    }

    // Fall back to weighted average if we have samples
    let service_samples: Vec<_> = metrics
        .samples
        .iter()
        .filter(|s| s.service_id == service_id)
        .cloned()
        .collect();

    if service_samples.len() >= 3 {
        let (avg, _, _, _, _) = calculate_weighted_stats(&service_samples);
        return avg as u64;
    }

    // Fall back to default
    (default_secs as u64) * 1000
}

/// Get statistics for all services
#[tauri::command]
pub fn get_service_averages() -> Vec<ServiceTimeStats> {
    let metrics = get_cached_metrics().lock().unwrap();
    let fingerprint = generate_pc_fingerprint();

    // Group samples by service_id
    let mut by_service: HashMap<String, Vec<ServiceTimeSample>> = HashMap::new();
    for sample in &metrics.samples {
        by_service
            .entry(sample.service_id.clone())
            .or_default()
            .push(sample.clone());
    }

    by_service
        .into_iter()
        .map(|(service_id, samples)| {
            let (avg, min, max, median, std_dev) = calculate_weighted_stats(&samples);
            let sample_count = samples.len();

            let confidence = match sample_count {
                0..=2 => "low",
                3..=4 => "medium",
                _ => "high",
            }
            .to_string();

            // Get estimated time and model quality if model exists
            let (estimated_ms, model_quality) = metrics
                .models
                .get(&service_id)
                .filter(|w| w.sample_count >= 5)
                .map(|w| (Some(predict_duration(w, &fingerprint)), Some(w.r_squared)))
                .unwrap_or((None, None));

            ServiceTimeStats {
                service_id,
                average_ms: avg,
                min_ms: min,
                max_ms: max,
                median_ms: median,
                sample_count,
                std_dev_ms: std_dev,
                confidence,
                estimated_ms,
                model_quality,
            }
        })
        .collect()
}

/// Get statistics for presets
#[tauri::command]
pub fn get_preset_averages() -> Vec<PresetTimeStats> {
    let metrics = get_cached_metrics().lock().unwrap();

    let mut by_preset: HashMap<String, Vec<ServiceTimeSample>> = HashMap::new();
    for sample in &metrics.samples {
        if let Some(ref preset_id) = sample.preset_id {
            by_preset
                .entry(preset_id.clone())
                .or_default()
                .push(sample.clone());
        }
    }

    by_preset
        .into_iter()
        .map(|(preset_id, samples)| {
            let (avg, min, max, _, _) = calculate_weighted_stats(&samples);
            let run_count = samples.len();

            let confidence = match run_count {
                0..=2 => "low",
                3..=4 => "medium",
                _ => "high",
            }
            .to_string();

            PresetTimeStats {
                preset_id,
                average_ms: avg,
                min_ms: min,
                max_ms: max,
                run_count,
                confidence,
            }
        })
        .collect()
}

/// Clear all metrics or metrics for a specific service
#[tauri::command]
pub fn clear_service_metrics(service_id: Option<String>) -> Result<u32, String> {
    let mut metrics = get_cached_metrics().lock().unwrap();

    let before_count = metrics.samples.len();

    if let Some(id) = &service_id {
        metrics.samples.retain(|s| s.service_id != *id);
        metrics.models.remove(id);
        metrics.samples_since_retrain.remove(id);
    } else {
        metrics.samples.clear();
        metrics.models.clear();
        metrics.samples_since_retrain.clear();
    }

    let removed = before_count - metrics.samples.len();
    save_metrics(&metrics)?;

    Ok(removed as u32)
}

/// Manually retrain all models
#[tauri::command]
pub fn retrain_time_models() -> Result<u32, String> {
    let mut metrics = get_cached_metrics().lock().unwrap();

    // Group samples by service
    let mut by_service: HashMap<String, Vec<ServiceTimeSample>> = HashMap::new();
    for sample in &metrics.samples {
        by_service
            .entry(sample.service_id.clone())
            .or_default()
            .push(sample.clone());
    }

    let mut trained_count = 0;
    for (service_id, samples) in by_service {
        if let Some(weights) = train_ridge_regression(&samples) {
            metrics.models.insert(service_id.clone(), weights);
            metrics.samples_since_retrain.insert(service_id, 0);
            trained_count += 1;
        }
    }

    save_metrics(&metrics)?;
    Ok(trained_count)
}
