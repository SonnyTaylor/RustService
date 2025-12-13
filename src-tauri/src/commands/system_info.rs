//! System information collection command

use sysinfo::{Components, Disks, Motherboard, Networks, System, Users};

use crate::types::{
    BatteryInfo, ComponentInfo, CpuInfo, DiskInfo, GpuInfo, LoadAvgInfo, MemoryInfo,
    MotherboardInfo, NetworkInfo, OsInfo, SystemInfo, UserInfo,
};

/// Collects comprehensive system information
///
/// Returns OS, CPU, memory, disk, motherboard, GPU, battery, temperature,
/// load average, network, and user information.
#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    // Create system instance and refresh relevant data
    let mut sys = System::new_all();
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

        CpuInfo {
            brand: first_cpu.map(|c| c.brand().to_string()).unwrap_or_default(),
            vendor_id: first_cpu
                .map(|c| c.vendor_id().to_string())
                .unwrap_or_default(),
            physical_cores: System::physical_core_count(),
            logical_cpus: cpus.len(),
            frequency_mhz: first_cpu.map(|c| c.frequency()).unwrap_or(0),
            global_usage: sys.global_cpu_usage(),
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
        uptime_seconds: System::uptime(),
        boot_time: System::boot_time(),
    })
}
