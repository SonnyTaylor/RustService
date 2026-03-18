//! System information collection command

use std::cmp::Ordering;
use std::process::Command;
use std::sync::{Mutex, OnceLock};

use sysinfo::{Components, Disks, Motherboard, Networks, System, Users};

use crate::types::{
    BatteryInfo, BiosInfo, ComponentInfo, CpuCoreInfo, CpuInfo, DiskInfo, GpuInfo, LoadAvgInfo,
    MemoryInfo, MotherboardInfo, NetworkInfo, OsInfo, ProcessInfo, RamSlotInfo, SystemInfo,
    SystemProductInfo, UserInfo,
};

static SYS: OnceLock<Mutex<System>> = OnceLock::new();

/// Collects comprehensive system information
///
/// Returns OS, CPU, memory, disk, motherboard, GPU, battery, temperature,
/// load average, network, and user information.
#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    tokio::task::spawn_blocking(get_system_info_blocking)
        .await
        .map_err(|e| format!("System info task failed: {e}"))?
}

fn get_system_info_blocking() -> Result<SystemInfo, String> {
    // Reuse the same System instance between calls so CPU and process usage
    // can be computed from deltas (sysinfo requires at least two refreshes).
    let sys_mutex = SYS.get_or_init(|| Mutex::new(System::new_all()));
    let mut sys = sys_mutex
        .lock()
        .map_err(|_| "Failed to lock system info collector".to_string())?;

    sys.refresh_all();

    // Collect OS info
    let os = OsInfo {
        name: System::name(),
        kernel_version: System::kernel_version(),
        os_version: System::os_version(),
        long_os_version: System::long_os_version(),
        hostname: System::host_name(),
    };

    // Collect CPU info
    let cpu = {
        let cpus = sys.cpus();
        let first_cpu = cpus.first();
        let cores: Vec<CpuCoreInfo> = cpus
            .iter()
            .map(|c| CpuCoreInfo {
                name: c.name().to_string(),
                cpu_usage: c.cpu_usage(),
                frequency_mhz: c.frequency(),
            })
            .collect();

        CpuInfo {
            brand: first_cpu.map(|c| c.brand().to_string()).unwrap_or_default(),
            vendor_id: first_cpu
                .map(|c| c.vendor_id().to_string())
                .unwrap_or_default(),
            physical_cores: System::physical_core_count(),
            logical_cpus: cpus.len(),
            frequency_mhz: first_cpu.map(|c| c.frequency()).unwrap_or(0),
            global_usage: sys.global_cpu_usage(),
            cores,
        }
    };

    // Collect memory info
    let memory = MemoryInfo {
        total_memory: sys.total_memory(),
        used_memory: sys.used_memory(),
        available_memory: sys.available_memory(),
        total_swap: sys.total_swap(),
        used_swap: sys.used_swap(),
    };

    // Collect disk info
    let disk_list = Disks::new_with_refreshed_list();
    let disks: Vec<DiskInfo> = disk_list
        .iter()
        .map(|disk| DiskInfo {
            name: disk.name().to_string_lossy().to_string(),
            mount_point: disk.mount_point().to_string_lossy().to_string(),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            file_system: disk.file_system().to_string_lossy().to_string(),
            disk_type: format!("{:?}", disk.kind()),
            is_removable: disk.is_removable(),
        })
        .collect();

    // Collect motherboard info (may not be available on all systems)
    let motherboard = Motherboard::new().map(|mb| MotherboardInfo {
        name: mb.name(),
        vendor: mb.vendor_name(),
        version: mb.version(),
        serial_number: mb.serial_number(),
    });

    // Collect GPU info using gfxinfo crate
    let gpu = match gfxinfo::active_gpu() {
        Ok(gpu_device) => {
            // This trait import is required for the .info() method
            #[allow(unused_imports)]
            use gfxinfo::GpuInfo as _;
            let info = gpu_device.info();
            Some(GpuInfo {
                vendor: gpu_device.vendor().to_string(),
                model: gpu_device.model().to_string(),
                family: gpu_device.family().to_string(),
                device_id: *gpu_device.device_id(),
                total_vram: info.total_vram(),
                used_vram: info.used_vram(),
                load_pct: info.load_pct(),
                temperature: info.temperature(),
            })
        }
        Err(_) => None,
    };

    // Collect battery info using battery crate
    let batteries: Vec<BatteryInfo> = battery::Manager::new()
        .ok()
        .and_then(|manager| manager.batteries().ok())
        .map(|batteries_iter| {
            batteries_iter
                .filter_map(|b| b.ok())
                .map(|b| {
                    use battery::units::electric_potential::volt;
                    use battery::units::energy::watt_hour;
                    use battery::units::power::watt;
                    use battery::units::ratio::percent;
                    use battery::units::thermodynamic_temperature::degree_celsius;
                    use battery::units::time::second;

                    BatteryInfo {
                        state_of_charge: b.state_of_charge().get::<percent>() / 100.0,
                        energy_wh: b.energy().get::<watt_hour>(),
                        energy_full_wh: b.energy_full().get::<watt_hour>(),
                        energy_full_design_wh: b.energy_full_design().get::<watt_hour>(),
                        power_rate_w: b.energy_rate().get::<watt>(),
                        voltage: b.voltage().get::<volt>(),
                        state_of_health: b.state_of_health().get::<percent>() / 100.0,
                        state: format!("{}", b.state()),
                        technology: format!("{}", b.technology()),
                        temperature: b.temperature().map(|t| t.get::<degree_celsius>()),
                        cycle_count: b.cycle_count(),
                        vendor: b.vendor().map(|s| s.to_string()),
                        model: b.model().map(|s| s.to_string()),
                        time_to_full_secs: b.time_to_full().map(|t| t.get::<second>() as u64),
                        time_to_empty_secs: b.time_to_empty().map(|t| t.get::<second>() as u64),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    // Collect component/temperature sensor info
    let component_list = Components::new_with_refreshed_list();
    let components: Vec<ComponentInfo> = component_list
        .iter()
        .map(|c| ComponentInfo {
            label: c.label().to_string(),
            temperature: c.temperature(),
            max_temperature: c.max(),
            critical_temperature: c.critical(),
            id: c.id().map(|s| s.to_string()),
        })
        .collect();

    // Collect load average
    let sys_load = System::load_average();
    let load_avg = LoadAvgInfo {
        one: sys_load.one,
        five: sys_load.five,
        fifteen: sys_load.fifteen,
    };

    // Collect network interface info
    let network_list = Networks::new_with_refreshed_list();
    let networks: Vec<NetworkInfo> = network_list
        .iter()
        .map(|(name, data)| NetworkInfo {
            name: name.clone(),
            mac_address: data.mac_address().to_string(),
            received: data.received(),
            total_received: data.total_received(),
            transmitted: data.transmitted(),
            total_transmitted: data.total_transmitted(),
            packets_received: data.packets_received(),
            packets_transmitted: data.packets_transmitted(),
            errors_received: data.errors_on_received(),
            errors_transmitted: data.errors_on_transmitted(),
        })
        .collect();

    // Collect user info
    let user_list = Users::new_with_refreshed_list();
    let users: Vec<UserInfo> = user_list
        .iter()
        .map(|u| UserInfo {
            name: u.name().to_string(),
            groups: u.groups().iter().map(|g| g.name().to_string()).collect(),
        })
        .collect();

    // Collect top processes (by CPU usage)
    let mut process_list: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, process)| ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().to_string(),
            cpu_usage: process.cpu_usage(),
            memory_bytes: process.memory(),
        })
        .collect();

    process_list.sort_by(|a, b| {
        b.cpu_usage
            .partial_cmp(&a.cpu_usage)
            .unwrap_or(Ordering::Equal)
    });

    let top_processes = process_list.into_iter().take(10).collect();

    // Collect WMI-based hardware details (best-effort, non-blocking)
    let (bios, system_product, ram_slots, cpu_l2_cache_kb, cpu_l3_cache_kb, cpu_socket) =
        collect_wmi_details();

    Ok(SystemInfo {
        os,
        cpu,
        memory,
        disks,
        motherboard,
        gpu,
        batteries,
        components,
        load_avg,
        networks,
        users,
        top_processes,
        uptime_seconds: System::uptime(),
        boot_time: System::boot_time(),
        bios,
        system_product,
        ram_slots,
        cpu_l2_cache_kb,
        cpu_l3_cache_kb,
        cpu_socket,
    })
}

/// WMI hardware details: (BIOS, SystemProduct, RAM slots, L2 cache KB, L3 cache KB, CPU socket)
type WmiDetails = (
    Option<BiosInfo>,
    Option<SystemProductInfo>,
    Vec<RamSlotInfo>,
    Option<u64>,
    Option<u64>,
    Option<String>,
);

/// Collect additional hardware details via PowerShell WMI queries.
/// Returns defaults on failure so the main command never errors from this.
fn collect_wmi_details() -> WmiDetails {
    let script = r#"
$bios = Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, ReleaseDate, SerialNumber
$sys = Get-CimInstance Win32_ComputerSystemProduct | Select-Object Vendor, Name, IdentifyingNumber, UUID
$ram = Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel, DeviceLocator, Manufacturer, PartNumber, SerialNumber, Speed, Capacity, FormFactor, SMBIOSMemoryType
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 L2CacheSize, L3CacheSize, SocketDesignation

$result = @{
    bios = @{
        manufacturer = $bios.Manufacturer
        version = $bios.SMBIOSBIOSVersion
        releaseDate = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString("yyyy-MM-dd") } else { $null }
        serialNumber = $bios.SerialNumber
    }
    systemProduct = @{
        vendor = $sys.Vendor
        model = $sys.Name
        serialNumber = $sys.IdentifyingNumber
        uuid = $sys.UUID
    }
    ramSlots = @($ram | ForEach-Object {
        @{
            bankLabel = $_.BankLabel
            deviceLocator = $_.DeviceLocator
            manufacturer = if ($_.Manufacturer) { $_.Manufacturer.Trim() } else { $null }
            partNumber = if ($_.PartNumber) { $_.PartNumber.Trim() } else { $null }
            serialNumber = if ($_.SerialNumber) { $_.SerialNumber.Trim() } else { $null }
            speedMhz = $_.Speed
            capacityBytes = $_.Capacity
            formFactor = $_.FormFactor
            smbiosMemoryType = $_.SMBIOSMemoryType
        }
    })
    cpuL2CacheKb = $cpu.L2CacheSize
    cpuL3CacheKb = $cpu.L3CacheSize
    cpuSocket = $cpu.SocketDesignation
}

$result | ConvertTo-Json -Depth 3 -Compress
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output();

    let output = match output {
        Ok(o) if o.status.success() => o,
        _ => return (None, None, Vec::new(), None, None, None),
    };

    let json_str = String::from_utf8_lossy(&output.stdout);
    let v: serde_json::Value = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(_) => return (None, None, Vec::new(), None, None, None),
    };

    let bios = Some(BiosInfo {
        manufacturer: v["bios"]["manufacturer"].as_str().map(String::from),
        version: v["bios"]["version"].as_str().map(String::from),
        release_date: v["bios"]["releaseDate"].as_str().map(String::from),
        serial_number: v["bios"]["serialNumber"].as_str().map(String::from),
    });

    let system_product = Some(SystemProductInfo {
        vendor: v["systemProduct"]["vendor"].as_str().map(String::from),
        model: v["systemProduct"]["model"].as_str().map(String::from),
        serial_number: v["systemProduct"]["serialNumber"].as_str().map(String::from),
        uuid: v["systemProduct"]["uuid"].as_str().map(String::from),
    });

    let form_factor_name = |n: u64| -> String {
        match n {
            8 => "DIMM".into(),
            12 => "SO-DIMM".into(),
            _ => format!("Type {n}"),
        }
    };

    let memory_type_name = |n: u64| -> String {
        match n {
            20 => "DDR".into(),
            21 => "DDR2".into(),
            24 => "DDR3".into(),
            26 => "DDR4".into(),
            34 => "DDR5".into(),
            _ => format!("Type {n}"),
        }
    };

    let ram_slots: Vec<RamSlotInfo> = v["ramSlots"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|slot| RamSlotInfo {
                    bank_label: slot["bankLabel"].as_str().map(String::from),
                    device_locator: slot["deviceLocator"].as_str().map(String::from),
                    manufacturer: slot["manufacturer"].as_str().map(String::from),
                    part_number: slot["partNumber"].as_str().map(String::from),
                    serial_number: slot["serialNumber"].as_str().map(String::from),
                    speed_mhz: slot["speedMhz"].as_u64(),
                    capacity_bytes: slot["capacityBytes"].as_u64(),
                    form_factor: slot["formFactor"]
                        .as_u64()
                        .map(&form_factor_name),
                    memory_type: slot["smbiosMemoryType"]
                        .as_u64()
                        .map(&memory_type_name),
                })
                .collect()
        })
        .unwrap_or_default();

    let cpu_l2 = v["cpuL2CacheKb"].as_u64();
    let cpu_l3 = v["cpuL3CacheKb"].as_u64();
    let cpu_socket = v["cpuSocket"].as_str().map(String::from);

    (bios, system_product, ram_slots, cpu_l2, cpu_l3, cpu_socket)
}
