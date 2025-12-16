//! Modular service system
//!
//! Each service is implemented in its own file and registered here.
//! Services implement the `Service` trait for consistent execution.

mod adwcleaner;
mod battery_info;
mod disk_space;
mod iperf;
mod kvrt_scan;
mod ping_test;
mod smartctl;
mod speedtest;
mod whynotwin11;
mod winsat;

use std::collections::HashMap;
use std::sync::LazyLock;
use tauri::AppHandle;

use crate::types::{PresetServiceConfig, ServiceDefinition, ServicePreset, ServiceResult};

// =============================================================================
// Service Trait
// =============================================================================

/// Trait that all services must implement
pub trait Service: Send + Sync {
    /// Returns the service definition (id, name, description, options, etc.)
    fn definition(&self) -> ServiceDefinition;

    /// Executes the service with the given options
    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult;
}

// =============================================================================
// Service Registry
// =============================================================================

/// Static registry of all available services
static SERVICE_REGISTRY: LazyLock<HashMap<String, Box<dyn Service>>> = LazyLock::new(|| {
    let services: Vec<Box<dyn Service>> = vec![
        Box::new(ping_test::PingTestService),
        Box::new(disk_space::DiskSpaceService),
        Box::new(winsat::WinsatService),
        Box::new(battery_info::BatteryInfoService),
        Box::new(kvrt_scan::KvrtScanService),
        Box::new(adwcleaner::AdwCleanerService),
        Box::new(whynotwin11::WhyNotWin11Service),
        Box::new(smartctl::SmartctlService),
        Box::new(speedtest::SpeedtestService),
        Box::new(iperf::IperfService),
    ];

    services
        .into_iter()
        .map(|s| (s.definition().id.clone(), s))
        .collect()
});

/// Get all service definitions
pub fn get_all_definitions() -> Vec<ServiceDefinition> {
    SERVICE_REGISTRY.values().map(|s| s.definition()).collect()
}

/// Get a service by ID
pub fn get_service(id: &str) -> Option<&'static dyn Service> {
    SERVICE_REGISTRY.get(id).map(|s| s.as_ref())
}

/// Run a service by ID
pub fn run_service(
    id: &str,
    options: &serde_json::Value,
    app: &AppHandle,
) -> Option<ServiceResult> {
    get_service(id).map(|s| s.run(options, app))
}

// =============================================================================
// Preset Definitions
// =============================================================================

/// Get all service presets
pub fn get_all_presets() -> Vec<ServicePreset> {
    vec![
        ServicePreset {
            id: "diagnostics".to_string(),
            name: "Diagnostics".to_string(),
            description: "Quick diagnostic tests to identify system issues".to_string(),
            services: vec![
                PresetServiceConfig {
                    service_id: "ping-test".to_string(),
                    enabled: true,
                    options: serde_json::json!({"target": "8.8.8.8", "count": 4}),
                },
                PresetServiceConfig {
                    service_id: "speedtest".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "disk-space".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "smartctl".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "battery-info".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "whynotwin11".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
            ],
            icon: "stethoscope".to_string(),
            color: "blue".to_string(),
        },
        ServicePreset {
            id: "general".to_string(),
            name: "General Service".to_string(),
            description: "Standard maintenance tasks for regular checkups".to_string(),
            services: vec![
                PresetServiceConfig {
                    service_id: "adwcleaner".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "kvrt-scan".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "ping-test".to_string(),
                    enabled: true,
                    options: serde_json::json!({"target": "8.8.8.8", "count": 4}),
                },
                PresetServiceConfig {
                    service_id: "speedtest".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "disk-space".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "smartctl".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "battery-info".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
            ],
            icon: "wrench".to_string(),
            color: "green".to_string(),
        },
        ServicePreset {
            id: "complete".to_string(),
            name: "Complete Service".to_string(),
            description: "Comprehensive scan and cleanup for thorough maintenance".to_string(),
            services: vec![
                PresetServiceConfig {
                    service_id: "adwcleaner".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "kvrt-scan".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "ping-test".to_string(),
                    enabled: true,
                    options: serde_json::json!({"target": "8.8.8.8", "count": 10}),
                },
                PresetServiceConfig {
                    service_id: "speedtest".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "iperf".to_string(),
                    enabled: true,
                    options: serde_json::json!({"server": "iperf.he.net", "duration": 60, "reverse": true}),
                },
                PresetServiceConfig {
                    service_id: "disk-space".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "smartctl".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "battery-info".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "whynotwin11".to_string(),
                    enabled: true,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "winsat".to_string(),
                    enabled: true,
                    options: serde_json::json!({"drive": "C"}),
                },
            ],
            icon: "shield-check".to_string(),
            color: "purple".to_string(),
        },
        ServicePreset {
            id: "custom".to_string(),
            name: "Custom Service".to_string(),
            description: "Build your own service configuration".to_string(),
            services: vec![
                PresetServiceConfig {
                    service_id: "adwcleaner".to_string(),
                    enabled: false,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "kvrt-scan".to_string(),
                    enabled: false,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "ping-test".to_string(),
                    enabled: false,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "speedtest".to_string(),
                    enabled: false,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "iperf".to_string(),
                    enabled: false,
                    options: serde_json::json!({"server": "iperf.he.net", "duration": 30, "reverse": true}),
                },
                PresetServiceConfig {
                    service_id: "disk-space".to_string(),
                    enabled: false,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "smartctl".to_string(),
                    enabled: false,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "battery-info".to_string(),
                    enabled: false,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "whynotwin11".to_string(),
                    enabled: false,
                    options: serde_json::json!({}),
                },
                PresetServiceConfig {
                    service_id: "winsat".to_string(),
                    enabled: false,
                    options: serde_json::json!({"drive": "C"}),
                },
            ],
            icon: "settings-2".to_string(),
            color: "orange".to_string(),
        },
    ]
}
