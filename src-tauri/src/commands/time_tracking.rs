//! Service time tracking commands
//!
//! Tauri commands for recording, analyzing, and estimating service execution times.
//! Uses IQR-based outlier filtering and linear regression for PC-specific estimates.

use std::collections::HashMap;
use std::fs;
use std::sync::{Mutex, OnceLock};

use chrono::Utc;
use sysinfo::{Disks, System};

use super::data_dir::get_data_dir_path;
use crate::types::{
    PcFingerprint, PresetTimeStats, ServiceModelWeights, ServiceTimeMetrics, ServiceTimeSample,
    ServiceTimeStats,
};

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
// PC Fingerprint Generation
// =============================================================================

/// Generate a normalized PC fingerprint for time correlation
fn generate_pc_fingerprint() -> PcFingerprint {
    let mut sys = System::new_all();
    sys.refresh_all();

    // CPU score: physical_cores * (frequency_ghz)
    let physical_cores = System::physical_core_count().unwrap_or(4) as f64;
    let frequency_ghz = sys
        .cpus()
        .first()
        .map(|c| c.frequency() as f64 / 1000.0)
        .unwrap_or(2.0);
    let cpu_score = physical_cores * frequency_ghz;

    // RAM in GB
    let total_ram_gb = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    let available_ram_gb = sys.available_memory() as f64 / (1024.0 * 1024.0 * 1024.0);

    // Check if primary disk is SSD
    let disk_list = Disks::new_with_refreshed_list();
    let disk_is_ssd = disk_list
        .iter()
        .next()
        .map(|d| format!("{:?}", d.kind()).to_lowercase().contains("ssd"))
        .unwrap_or(true);

    PcFingerprint {
        cpu_score,
        ram_gb: available_ram_gb,
        disk_is_ssd,
        total_ram_gb,
    }
}

// =============================================================================
// IQR-Based Outlier Filtering
// =============================================================================

/// Calculate IQR-filtered average (excludes outliers beyond 1.5*IQR)
fn calculate_iqr_filtered_stats(durations: &[u64]) -> (f64, u64, u64, u64, f64) {
    if durations.is_empty() {
        return (0.0, 0, 0, 0, 0.0);
    }

    let mut sorted: Vec<u64> = durations.to_vec();
    sorted.sort();

    let len = sorted.len();
    let min = sorted[0];
    let max = sorted[len - 1];
    let median = if len % 2 == 0 {
        (sorted[len / 2 - 1] + sorted[len / 2]) / 2
    } else {
        sorted[len / 2]
    };

    // Need at least 4 samples for IQR
    if len < 4 {
        let avg = sorted.iter().sum::<u64>() as f64 / len as f64;
        let variance = sorted
            .iter()
            .map(|&x| (x as f64 - avg).powi(2))
            .sum::<f64>()
            / len as f64;
        return (avg, min, max, median, variance.sqrt());
    }

    // Calculate Q1 and Q3
    let q1_idx = len / 4;
    let q3_idx = (3 * len) / 4;
    let q1 = sorted[q1_idx] as f64;
    let q3 = sorted[q3_idx] as f64;
    let iqr = q3 - q1;

    // Filter outliers (values outside 1.5*IQR from quartiles)
    let lower_bound = q1 - 1.5 * iqr;
    let upper_bound = q3 + 1.5 * iqr;

    let filtered: Vec<u64> = sorted
        .iter()
        .copied()
        .filter(|&x| (x as f64) >= lower_bound && (x as f64) <= upper_bound)
        .collect();

    let filtered_len = filtered.len();
    if filtered_len == 0 {
        // Fallback if all filtered out
        let avg = sorted.iter().sum::<u64>() as f64 / len as f64;
        let variance = sorted
            .iter()
            .map(|&x| (x as f64 - avg).powi(2))
            .sum::<f64>()
            / len as f64;
        return (avg, min, max, median, variance.sqrt());
    }

    let avg = filtered.iter().sum::<u64>() as f64 / filtered_len as f64;
    let variance = filtered
        .iter()
        .map(|&x| (x as f64 - avg).powi(2))
        .sum::<f64>()
        / filtered_len as f64;

    (avg, min, max, median, variance.sqrt())
}

// =============================================================================
// Linear Regression Training
// =============================================================================

/// Train a simple multivariate linear regression model
/// Uses ordinary least squares for: time = intercept + cpu*x1 + ram*x2 + ssd*x3
fn train_regression_model(samples: &[ServiceTimeSample]) -> Option<ServiceModelWeights> {
    if samples.len() < 5 {
        return None; // Need minimum 5 samples for meaningful regression
    }

    // Extract features and target
    let n = samples.len() as f64;
    let mut sum_y = 0.0;
    let mut sum_cpu = 0.0;
    let mut sum_ram = 0.0;
    let mut sum_ssd = 0.0;
    let mut sum_cpu_y = 0.0;
    let mut sum_ram_y = 0.0;
    let mut sum_ssd_y = 0.0;
    let mut sum_cpu2 = 0.0;
    let mut sum_ram2 = 0.0;
    let mut sum_ssd2 = 0.0;

    for sample in samples {
        let y = sample.duration_ms as f64;
        let cpu = sample.pc_fingerprint.cpu_score;
        let ram = sample.pc_fingerprint.ram_gb;
        let ssd = if sample.pc_fingerprint.disk_is_ssd {
            1.0
        } else {
            0.0
        };

        sum_y += y;
        sum_cpu += cpu;
        sum_ram += ram;
        sum_ssd += ssd;
        sum_cpu_y += cpu * y;
        sum_ram_y += ram * y;
        sum_ssd_y += ssd * y;
        sum_cpu2 += cpu * cpu;
        sum_ram2 += ram * ram;
        sum_ssd2 += ssd * ssd;
    }

    // Simple approach: compute individual correlations
    // (Full multivariate would need matrix inversion)
    let mean_y = sum_y / n;
    let mean_cpu = sum_cpu / n;
    let mean_ram = sum_ram / n;
    let mean_ssd = sum_ssd / n;

    // CPU coefficient
    let cpu_var = sum_cpu2 / n - mean_cpu * mean_cpu;
    let cpu_coef = if cpu_var > 0.001 {
        (sum_cpu_y / n - mean_cpu * mean_y) / cpu_var
    } else {
        0.0
    };

    // RAM coefficient
    let ram_var = sum_ram2 / n - mean_ram * mean_ram;
    let ram_coef = if ram_var > 0.001 {
        (sum_ram_y / n - mean_ram * mean_y) / ram_var
    } else {
        0.0
    };

    // SSD coefficient
    let ssd_var = sum_ssd2 / n - mean_ssd * mean_ssd;
    let ssd_coef = if ssd_var > 0.001 {
        (sum_ssd_y / n - mean_ssd * mean_y) / ssd_var
    } else {
        0.0
    };

    // Intercept
    let intercept = mean_y - cpu_coef * mean_cpu - ram_coef * mean_ram - ssd_coef * mean_ssd;

    Some(ServiceModelWeights {
        intercept,
        cpu_coef,
        ram_coef,
        ssd_coef,
        sample_count: samples.len(),
    })
}

/// Predict duration using trained model
fn predict_duration(weights: &ServiceModelWeights, fingerprint: &PcFingerprint) -> u64 {
    let ssd_val = if fingerprint.disk_is_ssd { 1.0 } else { 0.0 };
    let predicted = weights.intercept
        + weights.cpu_coef * fingerprint.cpu_score
        + weights.ram_coef * fingerprint.ram_gb
        + weights.ssd_coef * ssd_val;

    // Clamp to reasonable range (1 second to 1 hour)
    predicted.max(1000.0).min(3_600_000.0) as u64
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

/// Record a service execution time
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

    // Trim old samples if exceeded max
    let max_per_service = metrics.max_samples_per_service;
    let service_count = metrics
        .samples
        .iter()
        .filter(|s| s.service_id == service_id)
        .count();

    if service_count > max_per_service {
        // Remove oldest samples for this service
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

    // Retrain model for this service
    let service_samples: Vec<_> = metrics
        .samples
        .iter()
        .filter(|s| s.service_id == service_id)
        .cloned()
        .collect();

    if let Some(weights) = train_regression_model(&service_samples) {
        metrics.models.insert(service_id, weights);
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

    // Fall back to simple average if we have samples
    let durations: Vec<u64> = metrics
        .samples
        .iter()
        .filter(|s| s.service_id == service_id)
        .map(|s| s.duration_ms)
        .collect();

    if durations.len() >= 3 {
        let (avg, _, _, _, _) = calculate_iqr_filtered_stats(&durations);
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
    let mut by_service: HashMap<String, Vec<u64>> = HashMap::new();
    for sample in &metrics.samples {
        by_service
            .entry(sample.service_id.clone())
            .or_default()
            .push(sample.duration_ms);
    }

    by_service
        .into_iter()
        .map(|(service_id, durations)| {
            let (avg, min, max, median, std_dev) = calculate_iqr_filtered_stats(&durations);
            let sample_count = durations.len();

            let confidence = match sample_count {
                0..=2 => "low",
                3..=4 => "medium",
                _ => "high",
            }
            .to_string();

            // Get estimated time if model exists
            let estimated_ms = metrics
                .models
                .get(&service_id)
                .filter(|w| w.sample_count >= 5)
                .map(|w| predict_duration(w, &fingerprint));

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
            }
        })
        .collect()
}

/// Get statistics for presets
#[tauri::command]
pub fn get_preset_averages() -> Vec<PresetTimeStats> {
    let metrics = get_cached_metrics().lock().unwrap();

    // This is a simpler aggregation - sum of service times per preset_id
    // Note: Currently we don't track preset-level timing, just per-service
    // This would need to be enhanced if we want true preset timing

    let mut by_preset: HashMap<String, Vec<u64>> = HashMap::new();
    for sample in &metrics.samples {
        if let Some(ref preset_id) = sample.preset_id {
            by_preset
                .entry(preset_id.clone())
                .or_default()
                .push(sample.duration_ms);
        }
    }

    by_preset
        .into_iter()
        .map(|(preset_id, durations)| {
            let (avg, min, max, _, _) = calculate_iqr_filtered_stats(&durations);
            let run_count = durations.len();

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

    if let Some(id) = service_id {
        metrics.samples.retain(|s| s.service_id != id);
        metrics.models.remove(&id);
    } else {
        metrics.samples.clear();
        metrics.models.clear();
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
        if let Some(weights) = train_regression_model(&samples) {
            metrics.models.insert(service_id, weights);
            trained_count += 1;
        }
    }

    save_metrics(&metrics)?;
    Ok(trained_count)
}
