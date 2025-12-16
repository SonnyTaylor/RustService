//! Service time tracking commands
//!
//! Tauri commands for recording, analyzing, and estimating service execution times.
//!
//! Implementation features:
//! - **SGD with learning rate decay**: Prevents oscillation, ensures convergence
//! - **Bias initialization**: Starts at mean(y) for faster training
//! - **Static data caching**: Expensive hardware detection done once at startup
//! - **Debounced disk I/O**: Saves every N samples to prevent UI freezes
//! - **Log-normal outlier detection**: Better handles execution time distributions
//! - **Thermal throttling detection**: Tracks CPU temperature for performance prediction
//! - **Swap/memory pressure tracking**: Detects disk thrashing conditions
//! - **Correct coefficient clamping**: Load/temp/swap positive, hardware specs negative

use std::collections::HashMap;
use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};

use chrono::{DateTime, Utc};
use sysinfo::{Components, DiskKind, Disks, Networks, System};

use super::data_dir::get_data_dir_path;
use crate::types::{
    FeatureNormalization, NetworkType, PcFingerprint, PresetTimeStats, ServiceModelWeights,
    ServiceTimeMetrics, ServiceTimeSample, ServiceTimeStats,
};

// =============================================================================
// Constants
// =============================================================================

/// Ridge regularization parameter (prevents overfitting)
const RIDGE_LAMBDA: f64 = 0.01;

/// Time decay base (0.95^days_old)
const TIME_DECAY_BASE: f64 = 0.95;

/// Number of features in the fingerprint vector
/// Features: cpu_score, ram, ssd, power, avx2, gpu, net, cpu_load, bias, cpu_temp, swap
const NUM_FEATURES: usize = 11;

/// Base SGD learning rate (will decay over epochs)
const BASE_LEARNING_RATE: f64 = 0.05;

/// Learning rate decay factor: lr = base_lr / (1 + decay * epoch)
const LEARNING_RATE_DECAY: f64 = 0.001;

/// SGD epochs (1000 for better convergence with batch GD)
const SGD_EPOCHS: usize = 1000;

/// Feature indices for coefficient clamping
const IDX_CPU_LOAD: usize = 7; // Positive coef (higher load = slower)
const IDX_BIAS: usize = 8; // Intercept (unclamped)
const IDX_CPU_TEMP: usize = 9; // Positive coef (thermal throttling = slower)
const IDX_SWAP_USAGE: usize = 10; // Positive coef (swap thrashing = much slower)

/// Number of samples to accumulate before saving to disk (debounce)
const SAVE_DEBOUNCE_COUNT: usize = 10;

/// Global counter for save debouncing (reduces disk I/O)
static SAVE_COUNTER: AtomicUsize = AtomicUsize::new(0);

// =============================================================================
// Metrics File Management
// =============================================================================

static METRICS_CACHE: OnceLock<Mutex<ServiceTimeMetrics>> = OnceLock::new();
static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();

fn get_system() -> &'static Mutex<System> {
    SYSTEM.get_or_init(|| Mutex::new(System::new()))
}

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
// Static PC Data Cache (expensive to compute, rarely changes)
// =============================================================================

/// Cached static PC specs that don't change during runtime
struct StaticPcSpecs {
    physical_cores: u32,
    logical_cores: u32,
    frequency_ghz: f64,
    cpu_score: f64,
    total_ram_gb: f64,
    disk_is_ssd: bool,
    has_avx2: bool,
    has_discrete_gpu: bool,
    is_laptop: bool, // Track if we need to check battery
}

static STATIC_SPECS: OnceLock<StaticPcSpecs> = OnceLock::new();

/// Initialize static specs ONCE (expensive operations)
fn get_static_specs() -> &'static StaticPcSpecs {
    STATIC_SPECS.get_or_init(|| {
        // Only refresh CPU for static data
        let sys = System::new_all(); // Full refresh ONCE at startup

        let physical_cores = System::physical_core_count().unwrap_or(4) as u32;
        let logical_cores = sys.cpus().len() as u32;
        let frequency_ghz = sys
            .cpus()
            .first()
            .map(|c| c.frequency() as f64 / 1000.0)
            .unwrap_or(2.0);

        let cpu_score =
            PcFingerprint::compute_cpu_score(physical_cores, logical_cores, frequency_ghz);
        let total_ram_gb = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);

        // Disk type - check primary/largest disk
        // DiskKind::Unknown typically means NVMe (Windows doesn't expose the type properly)
        // so we treat Unknown as SSD (modern assumption), only explicit HDD is slow
        let disk_list = Disks::new_with_refreshed_list();
        let disk_is_ssd = disk_list
            .iter()
            .max_by_key(|d| d.total_space())
            .map(|d| !matches!(d.kind(), DiskKind::HDD))
            .unwrap_or(true); // Default to SSD if unknown

        // AVX2
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

        // Discrete GPU
        let has_discrete_gpu = match gfxinfo::active_gpu() {
            Ok(gpu) => {
                let vendor = gpu.vendor().to_lowercase();
                vendor.contains("nvidia") || vendor.contains("amd") || vendor.contains("radeon")
            }
            Err(_) => false,
        };

        // Check if laptop (has any batteries)
        let is_laptop = battery::Manager::new()
            .ok()
            .and_then(|m| m.batteries().ok())
            .map(|mut b| b.next().is_some())
            .unwrap_or(false);

        StaticPcSpecs {
            physical_cores,
            logical_cores,
            frequency_ghz,
            cpu_score,
            total_ram_gb,
            disk_is_ssd,
            has_avx2,
            has_discrete_gpu,
            is_laptop,
        }
    })
}

// =============================================================================
// PC Fingerprint Generation (Optimized)
// =============================================================================

/// Generate PC fingerprint with minimal system calls
///
/// Gathers dynamic system metrics:
/// - CPU load, RAM availability, swap usage, CPU temperature
/// - Power source status (for laptops)
/// - Network type
fn generate_pc_fingerprint() -> PcFingerprint {
    let static_specs = get_static_specs();

    // Use persistent System instance to avoid "always 0.0" CPU usage bug
    let (available_ram_gb, swap_used_gb, cpu_load_percent) = {
        let mut sys = get_system().lock().unwrap();
        sys.refresh_memory();
        sys.refresh_cpu_usage();
        (
            sys.available_memory() as f64 / (1024.0 * 1024.0 * 1024.0),
            sys.used_swap() as f64 / (1024.0 * 1024.0 * 1024.0),
            sys.global_cpu_usage() as f64,
        )
    };

    // Get CPU temperature (NEW: for thermal throttling detection)
    // Note: On Windows, this may not always return values for all CPUs
    // We use a separate Components instance to avoid refreshing everything
    let cpu_temp_c = {
        let components = Components::new_with_refreshed_list();
        components
            .iter()
            .filter(|c| {
                let label = c.label().to_lowercase();
                label.contains("cpu") || label.contains("core") || label.contains("package")
            })
            .filter_map(|c| c.temperature()) // temperature() returns Option<f32>
            .map(|t| t as f64)
            .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap_or(40.0) // Default to cool temp if sensor not found
    };

    // Power source - only check if laptop
    let is_on_ac_power = if static_specs.is_laptop {
        battery::Manager::new()
            .ok()
            .and_then(|m| m.batteries().ok())
            .map(|mut batteries| {
                batteries.all(|b| {
                    b.map(|batt| batt.state() != battery::State::Discharging)
                        .unwrap_or(true)
                })
            })
            .unwrap_or(true)
    } else {
        true // Desktop always on AC
    };

    // Network type (cached-ish, minimal overhead)
    let network_type = detect_network_type();

    PcFingerprint {
        physical_cores: static_specs.physical_cores,
        logical_cores: static_specs.logical_cores,
        frequency_ghz: static_specs.frequency_ghz,
        cpu_score: static_specs.cpu_score,
        available_ram_gb,
        total_ram_gb: static_specs.total_ram_gb,
        disk_is_ssd: static_specs.disk_is_ssd,
        is_on_ac_power,
        has_avx2: static_specs.has_avx2,
        has_discrete_gpu: static_specs.has_discrete_gpu,
        network_type,
        cpu_load_percent,
        cpu_temp_c,   // NEW: Thermal throttling indicator
        swap_used_gb, // NEW: Memory pressure indicator
    }
}

/// Detect network connection type (lightweight)
fn detect_network_type() -> NetworkType {
    let networks = Networks::new_with_refreshed_list();

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

    let mut means: Vec<f64> = sums.iter().map(|&s| s / n).collect();
    // Force bias term mean to 0.0 so that (1.0 - 0.0) / 1.0 remains 1.0
    if means.len() > IDX_BIAS {
        means[IDX_BIAS] = 0.0;
    }

    let std_devs: Vec<f64> = sq_sums
        .iter()
        .zip(means.iter())
        .map(|(&sq, &mean)| {
            let variance = (sq / n) - (mean * mean);
            if variance > 0.0001 {
                variance.sqrt()
            } else {
                1.0
            }
        })
        .collect();

    FeatureNormalization { means, std_devs }
}

fn normalize_features(features: &[f64], norm: &FeatureNormalization) -> Vec<f64> {
    features
        .iter()
        .zip(norm.means.iter())
        .zip(norm.std_devs.iter())
        .map(|((&x, &mean), &std)| (x - mean) / std)
        .collect()
}

// =============================================================================
// Time Decay
// =============================================================================

fn calculate_time_decay(timestamp: &str) -> f64 {
    let sample_time = DateTime::parse_from_rfc3339(timestamp)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    let days_old = (Utc::now() - sample_time).num_days().max(0) as f64;
    TIME_DECAY_BASE.powf(days_old)
}

// =============================================================================
// Stochastic Gradient Descent (SGD) Ridge Regression
// =============================================================================

/// Train using SGD with learning rate decay
///
/// Enhancements:
/// - Learning rate decay: lr = base_lr / (1 + decay * epoch) prevents oscillation
/// - Bias initialized to mean(y) for faster convergence
/// - Correct coefficient clamping for all feature types
fn train_sgd_regression(samples: &[ServiceTimeSample]) -> Option<ServiceModelWeights> {
    if samples.len() < 5 {
        return None;
    }

    let normalization = calculate_normalization(samples);

    // Prepare data
    // Includes bias term (1.0) as the last feature
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

    // Calculate mean duration for bias initialization (gives SGD a head start)
    let y_mean: f64 = y_values.iter().sum::<f64>() / n as f64;

    // Initialize coefficients:
    // - Bias term starts at mean(y) so SGD doesn't spend epochs finding baseline
    // - Other coefficients start at 0
    let mut coefficients = vec![0.0; NUM_FEATURES];
    coefficients[IDX_BIAS] = y_mean;

    // SGD training loop with learning rate decay
    for epoch in 0..SGD_EPOCHS {
        // Learning rate decay: lr = base_lr / (1 + decay * epoch)
        // This prevents oscillation as we approach the minimum
        let learning_rate = BASE_LEARNING_RATE / (1.0 + LEARNING_RATE_DECAY * epoch as f64);

        let mut gradients = vec![0.0; NUM_FEATURES];

        for i in 0..n {
            // Predict: sum(coef * feature)
            // Note: Bias is just another feature (1.0)
            let prediction: f64 = x_matrix[i]
                .iter()
                .zip(coefficients.iter())
                .map(|(x, c)| x * c)
                .sum::<f64>();

            let error = prediction - y_values[i];
            let sample_weight = weights[i];

            // Accumulate gradients with L2 regularization
            for j in 0..NUM_FEATURES {
                // Don't regularize bias term (intercept)
                let regularization = if j == IDX_BIAS {
                    0.0
                } else {
                    RIDGE_LAMBDA * coefficients[j]
                };
                gradients[j] += sample_weight * error * x_matrix[i][j] + regularization;
            }
        }

        // Update coefficients with decaying learning rate
        for j in 0..NUM_FEATURES {
            coefficients[j] -= (learning_rate * gradients[j]) / n as f64;
        }
    }

    // Apply coefficient clamping with CORRECT signs for all features
    for (j, coef) in coefficients.iter_mut().enumerate() {
        if j == IDX_CPU_LOAD || j == IDX_CPU_TEMP || j == IDX_SWAP_USAGE {
            // These factors INCREASE execution time when high:
            // - CPU load: contention = slower
            // - CPU temp: thermal throttling = slower
            // - Swap usage: disk thrashing = MUCH slower
            // Coefficient should be POSITIVE
            *coef = coef.clamp(0.0, 100000.0);
        } else if j == IDX_BIAS {
            // Intercept: can be anything (unclamped)
        } else {
            // Hardware specs (RAM, SSD, GPU, etc.): higher = FASTER
            // High RAM (pos Z) -> Low Time. Coef should be NEGATIVE.
            *coef = coef.clamp(-100000.0, 0.0);
        }
    }

    // Calculate R-squared
    let y_mean: f64 = y_values.iter().sum::<f64>() / n as f64;
    let ss_tot: f64 = y_values
        .iter()
        .zip(weights.iter())
        // R2 is usually calculated against mean, weighted or unweighted.
        // Using standard mean here for standard R2 interpretation.
        .map(|(y, w)| w * (y - y_mean).powi(2))
        .sum();

    let mut ss_res = 0.0;
    for i in 0..n {
        let predicted: f64 = x_matrix[i]
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
        intercept: 0.0, // Intercept is now embedded in coefficients[IDX_BIAS]
        coefficients,
        sample_count: n,
        normalization,
        ridge_lambda: RIDGE_LAMBDA,
        r_squared,
    })
}

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
// Log-Normal IQR-Based Outlier Filtering
// =============================================================================

/// Calculate weighted stats with log-normal outlier filtering
///
/// Execution times follow a log-normal distribution:
/// - Cannot be negative
/// - Have long right tails (random huge lags)
///
/// Using ln(duration) for IQR calculation handles outliers much better
/// than linear-space statistics.
fn calculate_weighted_stats(samples: &[ServiceTimeSample]) -> (f64, u64, u64, u64, f64) {
    if samples.is_empty() {
        return (0.0, 0, 0, 0, 0.0);
    }

    // Convert to (duration, weight, ln_duration) tuples
    let mut weighted_pairs: Vec<(u64, f64, f64)> = samples
        .iter()
        .map(|s| {
            let dur = s.duration_ms.max(1); // Avoid ln(0)
            (dur, calculate_time_decay(&s.timestamp), (dur as f64).ln())
        })
        .collect();

    // Sort by duration for min/max/median
    weighted_pairs.sort_by_key(|(d, _, _)| *d);

    let len = weighted_pairs.len();
    let min = weighted_pairs[0].0;
    let max = weighted_pairs[len - 1].0;
    let median = weighted_pairs[len / 2].0;

    // Apply IQR filtering in LOG SPACE (handles long-tail outliers better)
    let filtered_pairs = if len >= 4 {
        // Sort by ln_duration for log-space IQR
        let mut log_sorted = weighted_pairs.clone();
        log_sorted.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal));

        let q1_idx = len / 4;
        let q3_idx = (3 * len) / 4;
        let q1_ln = log_sorted[q1_idx].2;
        let q3_ln = log_sorted[q3_idx].2;
        let iqr_ln = q3_ln - q1_ln;

        // IQR bounds in log space
        let lower_ln = q1_ln - 1.5 * iqr_ln;
        let upper_ln = q3_ln + 1.5 * iqr_ln;

        weighted_pairs
            .into_iter()
            .filter(|(_, _, ln_d)| *ln_d >= lower_ln && *ln_d <= upper_ln)
            .map(|(d, w, _)| (d, w))
            .collect::<Vec<_>>()
    } else {
        weighted_pairs.into_iter().map(|(d, w, _)| (d, w)).collect()
    };

    if filtered_pairs.is_empty() {
        return (median as f64, min, max, median, 0.0);
    }

    let total_weight: f64 = filtered_pairs.iter().map(|(_, w)| w).sum();
    let weighted_avg: f64 = filtered_pairs
        .iter()
        .map(|(d, w)| (*d as f64) * w)
        .sum::<f64>()
        / total_weight;

    let variance: f64 = filtered_pairs
        .iter()
        .map(|(d, w)| w * (*d as f64 - weighted_avg).powi(2))
        .sum::<f64>()
        / total_weight;

    (weighted_avg, min, max, median, variance.sqrt())
}

// =============================================================================
// Composite Key Helper
// =============================================================================

/// Create a composite key for model storage: "service_id:hash" or just "service_id"
fn make_model_key(service_id: &str, options_hash: &Option<String>) -> String {
    if let Some(hash) = options_hash {
        format!("{}:{}", service_id, hash)
    } else {
        service_id.to_string()
    }
}

// =============================================================================
// Tauri Commands
// =============================================================================

#[tauri::command]
pub fn get_service_time_metrics() -> ServiceTimeMetrics {
    let metrics = get_cached_metrics().lock().unwrap();
    metrics.clone()
}

/// Record a service execution time
/// Only records SUCCESSFUL services (failed services filtered out by caller)
///
/// OPTIMIZATION: Uses debounced saving to prevent disk thrashing.
/// Writing JSON on every sample would freeze the UI in batch operations.
#[tauri::command]
pub fn record_service_time(
    service_id: String,
    duration_ms: u64,
    preset_id: Option<String>,
    options_hash: Option<String>,
) -> Result<(), String> {
    // Generate fingerprint OUTSIDE the lock to avoid freezing UI during hardware scan
    let pc_fingerprint = generate_pc_fingerprint();

    let mut metrics = get_cached_metrics().lock().unwrap();

    // Clone options_hash before moving into struct (for model key lookup later)
    let options_hash_for_key = options_hash.clone();

    let sample = ServiceTimeSample {
        service_id: service_id.clone(),
        duration_ms,
        timestamp: Utc::now().to_rfc3339(),
        pc_fingerprint,
        preset_id,
        options_hash,
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

    // Create composite key for options-aware tracking
    let model_key = make_model_key(&service_id, &options_hash_for_key);

    // Batch retraining
    let batch_size = metrics.retrain_batch_size;
    let counter = metrics
        .samples_since_retrain
        .entry(model_key.clone())
        .or_insert(0);
    *counter += 1;

    if *counter >= batch_size {
        *counter = 0;

        // Filter samples by EXACT service_id AND options_hash match
        let service_samples: Vec<_> = metrics
            .samples
            .iter()
            .filter(|s| s.service_id == service_id && s.options_hash == options_hash_for_key)
            .cloned()
            .collect();

        if let Some(weights) = train_sgd_regression(&service_samples) {
            metrics.models.insert(model_key, weights);
        }
    }

    // OPTIMIZATION: Debounced saving to prevent disk thrashing
    // Only save to disk every N samples instead of on every single sample
    let current_count = SAVE_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
    if current_count >= SAVE_DEBOUNCE_COUNT {
        SAVE_COUNTER.store(0, Ordering::Relaxed);
        save_metrics(&metrics)?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_pc_fingerprint() -> PcFingerprint {
    generate_pc_fingerprint()
}

/// Get estimated time for a service with specific options on the current PC
#[tauri::command]
pub fn get_estimated_time(
    service_id: String,
    options: Option<serde_json::Value>,
    default_secs: u32,
) -> u64 {
    // Move fingerprint generation outside lock
    let fingerprint = generate_pc_fingerprint();
    let metrics = get_cached_metrics().lock().unwrap();

    // Compute hash if options provided
    let options_hash = options.map(|o| compute_options_hash(&o));

    // Create composite key for this service+options combination
    let model_key = make_model_key(&service_id, &options_hash);

    // Try trained model with composite key first
    if let Some(weights) = metrics.models.get(&model_key) {
        if weights.sample_count >= 5 {
            return predict_duration(weights, &fingerprint);
        }
    }

    // Fall back to weighted average of samples with matching options_hash
    let service_samples: Vec<_> = metrics
        .samples
        .iter()
        .filter(|s| s.service_id == service_id && s.options_hash == options_hash)
        .cloned()
        .collect();

    if service_samples.len() >= 3 {
        let (avg, _, _, _, _) = calculate_weighted_stats(&service_samples);
        return avg as u64;
    }

    // Fall back to ANY samples for this service (ignoring options)
    let any_samples: Vec<_> = metrics
        .samples
        .iter()
        .filter(|s| s.service_id == service_id)
        .cloned()
        .collect();

    if any_samples.len() >= 3 {
        let (avg, _, _, _, _) = calculate_weighted_stats(&any_samples);
        return avg as u64;
    }

    (default_secs as u64) * 1000
}

#[tauri::command]
pub fn get_service_averages() -> Vec<ServiceTimeStats> {
    // Move fingerprint generation outside lock
    let fingerprint = generate_pc_fingerprint();
    let metrics = get_cached_metrics().lock().unwrap();

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

#[tauri::command]
pub fn clear_service_metrics(service_id: Option<String>) -> Result<u32, String> {
    let mut metrics = get_cached_metrics().lock().unwrap();

    let before_count = metrics.samples.len();

    if let Some(id) = &service_id {
        // Remove samples for this service ID
        metrics.samples.retain(|s| s.service_id != *id);

        // Remove models: check if key starts with "service_id" (handles composite keys)
        let keys_to_remove: Vec<String> = metrics
            .models
            .keys()
            .filter(|k| *k == id || k.starts_with(&format!("{}:", id)))
            .cloned()
            .collect();
        for k in keys_to_remove {
            metrics.models.remove(&k);
            metrics.samples_since_retrain.remove(&k);
        }
    } else {
        metrics.samples.clear();
        metrics.models.clear();
        metrics.samples_since_retrain.clear();
    }

    let removed = before_count - metrics.samples.len();
    save_metrics(&metrics)?;
    Ok(removed as u32)
}

#[tauri::command]
pub fn retrain_time_models() -> Result<u32, String> {
    let mut metrics = get_cached_metrics().lock().unwrap();

    // Group samples by (service_id, options_hash) tuple to create specific models
    let mut by_service_options: HashMap<(String, Option<String>), Vec<ServiceTimeSample>> =
        HashMap::new();
    for sample in &metrics.samples {
        by_service_options
            .entry((sample.service_id.clone(), sample.options_hash.clone()))
            .or_default()
            .push(sample.clone());
    }

    let mut trained_count = 0;
    for ((service_id, options_hash), samples) in by_service_options {
        if let Some(weights) = train_sgd_regression(&samples) {
            let model_key = make_model_key(&service_id, &options_hash);
            metrics.models.insert(model_key.clone(), weights);
            metrics.samples_since_retrain.insert(model_key, 0);
            trained_count += 1;
        }
    }

    save_metrics(&metrics)?;
    Ok(trained_count)
}

/// Compute a hash of service options for settings-aware tracking
pub fn compute_options_hash(options: &serde_json::Value) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let options_str = options.to_string();
    let mut hasher = DefaultHasher::new();
    options_str.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

/// Force-save any pending metrics to disk
///
/// Should be called on app close to ensure no data is lost due to debouncing.
/// The debounced saving mechanism may have unsaved data in memory.
#[tauri::command]
pub fn flush_service_metrics() -> Result<(), String> {
    // Reset the save counter
    SAVE_COUNTER.store(0, Ordering::Relaxed);

    // Force save current metrics
    let metrics = get_cached_metrics().lock().unwrap();
    save_metrics(&metrics)
}
