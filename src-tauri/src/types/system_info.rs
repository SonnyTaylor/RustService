//! System information types
//!
//! Data structures for collecting and serializing system information.

use serde::Serialize;

/// Operating system information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub name: Option<String>,
    pub kernel_version: Option<String>,
    pub os_version: Option<String>,
    pub long_os_version: Option<String>,
    pub hostname: Option<String>,
}

/// CPU/Processor information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub brand: String,
    pub vendor_id: String,
    pub physical_cores: Option<usize>,
    pub logical_cpus: usize,
    pub frequency_mhz: u64,
    pub global_usage: f32,
}

/// Memory (RAM/Swap) information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total_memory: u64,
    pub used_memory: u64,
    pub available_memory: u64,
    pub total_swap: u64,
    pub used_swap: u64,
}

/// Disk/Storage information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub file_system: String,
    pub disk_type: String,
    pub is_removable: bool,
}

/// Motherboard information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotherboardInfo {
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub version: Option<String>,
    pub serial_number: Option<String>,
}

/// GPU/Graphics card information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub vendor: String,
    pub model: String,
    pub family: String,
    pub device_id: u32,
    /// Total VRAM in bytes
    pub total_vram: u64,
    /// Used VRAM in bytes
    pub used_vram: u64,
    /// GPU load percentage (0-100)
    pub load_pct: u32,
    /// Temperature in millicelsius (divide by 1000 for Celsius)
    pub temperature: u32,
}

/// Battery information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    /// State of charge (0.0 - 1.0)
    pub state_of_charge: f32,
    /// Current energy in watt-hours
    pub energy_wh: f32,
    /// Full charge energy in watt-hours
    pub energy_full_wh: f32,
    /// Design capacity in watt-hours
    pub energy_full_design_wh: f32,
    /// Power draw/charge rate in watts
    pub power_rate_w: f32,
    /// Voltage in volts
    pub voltage: f32,
    /// State of health (0.0 - 1.0)
    pub state_of_health: f32,
    /// Current state: "Charging", "Discharging", "Full", "Empty", "Unknown"
    pub state: String,
    /// Battery technology
    pub technology: String,
    /// Temperature in Celsius (if available)
    pub temperature: Option<f32>,
    /// Cycle count (if available)
    pub cycle_count: Option<u32>,
    /// Vendor name
    pub vendor: Option<String>,
    /// Model name
    pub model: Option<String>,
    /// Time to full in seconds (if charging)
    pub time_to_full_secs: Option<u64>,
    /// Time to empty in seconds (if discharging)
    pub time_to_empty_secs: Option<u64>,
}

/// Temperature sensor/component information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentInfo {
    /// Component label/name
    pub label: String,
    /// Current temperature in Celsius
    pub temperature: Option<f32>,
    /// Maximum recorded temperature in Celsius
    pub max_temperature: Option<f32>,
    /// Critical temperature threshold in Celsius
    pub critical_temperature: Option<f32>,
    /// Component identifier
    pub id: Option<String>,
}

/// System load average information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadAvgInfo {
    /// Average load within one minute
    pub one: f64,
    /// Average load within five minutes
    pub five: f64,
    /// Average load within fifteen minutes
    pub fifteen: f64,
}

/// Network interface information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    /// Interface name (e.g., "eth0", "Wi-Fi")
    pub name: String,
    /// MAC address
    pub mac_address: String,
    /// Bytes received since last refresh
    pub received: u64,
    /// Total bytes received
    pub total_received: u64,
    /// Bytes transmitted since last refresh
    pub transmitted: u64,
    /// Total bytes transmitted
    pub total_transmitted: u64,
    /// Packets received since last refresh
    pub packets_received: u64,
    /// Packets transmitted since last refresh
    pub packets_transmitted: u64,
    /// Receive errors since last refresh
    pub errors_received: u64,
    /// Transmit errors since last refresh
    pub errors_transmitted: u64,
}

/// System user information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    /// Username
    pub name: String,
    /// User groups
    pub groups: Vec<String>,
}

/// Complete system information response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: OsInfo,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub disks: Vec<DiskInfo>,
    pub motherboard: Option<MotherboardInfo>,
    pub gpu: Option<GpuInfo>,
    pub batteries: Vec<BatteryInfo>,
    /// Temperature sensors
    pub components: Vec<ComponentInfo>,
    /// System load average
    pub load_avg: LoadAvgInfo,
    /// Network interfaces
    pub networks: Vec<NetworkInfo>,
    /// System users
    pub users: Vec<UserInfo>,
    pub uptime_seconds: u64,
    pub boot_time: u64,
}
