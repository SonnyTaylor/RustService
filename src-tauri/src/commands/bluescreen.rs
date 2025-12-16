//! Bluescreen (BSOD) analysis commands
//!
//! Commands for finding and analyzing Windows crash dump files.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

// ============================================================================
// Types
// ============================================================================

/// Summary of a BSOD crash
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BsodEntry {
    pub id: String,
    pub dump_path: String,
    pub crash_time: String,
    pub stop_code: String,
    pub stop_code_name: Option<String>,
    pub faulting_module: Option<String>,
    pub bug_check_code: String,
    pub parameters: Vec<String>,
    pub file_size_bytes: u64,
}

/// Detailed BSOD analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BsodDetails {
    pub dump_path: String,
    pub dump_type: String,
    pub crash_time: String,
    pub uptime_before_crash: Option<String>,
    pub stop_code: String,
    pub stop_code_name: Option<String>,
    pub stop_code_description: Option<String>,
    pub bug_check_code: String,
    pub parameters: Vec<String>,
    pub faulting_module: Option<String>,
    pub faulting_module_path: Option<String>,
    pub stack_trace: Vec<String>,
    pub loaded_modules: Vec<String>,
    pub possible_causes: Vec<String>,
    pub recommendations: Vec<String>,
}

/// BSOD statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BsodStats {
    pub total_crashes: u32,
    pub crashes_last_7_days: u32,
    pub crashes_last_30_days: u32,
    pub most_common_stop_code: Option<String>,
    pub most_common_module: Option<String>,
    pub oldest_crash: Option<String>,
    pub newest_crash: Option<String>,
}

// ============================================================================
// Stop Code Database
// ============================================================================

/// Get human-readable name and description for a stop code
fn get_stop_code_info(code: &str) -> (Option<String>, Option<String>, Vec<String>) {
    let code_upper = code.to_uppercase();

    // Common stop codes and their meanings
    let (name, desc, causes) = match code_upper.as_str() {
        "0X0000001E" | "KMODE_EXCEPTION_NOT_HANDLED" => (
            "KMODE_EXCEPTION_NOT_HANDLED",
            "A kernel-mode program generated an exception which the error handler did not catch.",
            vec!["Faulty device driver", "Hardware incompatibility", "Corrupted system files"],
        ),
        "0X00000024" | "NTFS_FILE_SYSTEM" => (
            "NTFS_FILE_SYSTEM",
            "A problem occurred within the NTFS file system driver.",
            vec!["Hard drive failure", "Corrupted NTFS volume", "Faulty disk controller"],
        ),
        "0X0000003B" | "SYSTEM_SERVICE_EXCEPTION" => (
            "SYSTEM_SERVICE_EXCEPTION",
            "An exception happened while executing a routine that transitions from non-privileged to privileged code.",
            vec!["Incompatible driver", "Windows system file corruption", "Antivirus software conflict"],
        ),
        "0X0000007E" | "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED" => (
            "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED",
            "A system thread generated an exception that the error handler did not catch.",
            vec!["Incompatible device driver", "Insufficient disk space", "Corrupted system file"],
        ),
        "0X0000007F" | "UNEXPECTED_KERNEL_MODE_TRAP" => (
            "UNEXPECTED_KERNEL_MODE_TRAP",
            "The CPU generated a trap and the kernel failed to catch it.",
            vec!["RAM failure", "CPU overheating", "Hardware malfunction"],
        ),
        "0X0000009F" | "DRIVER_POWER_STATE_FAILURE" => (
            "DRIVER_POWER_STATE_FAILURE",
            "A driver has failed to complete a power IRP within a specific time.",
            vec!["Driver not properly handling power state transitions", "USB device issues", "Outdated power management driver"],
        ),
        "0X000000A0" | "INTERNAL_POWER_ERROR" => (
            "INTERNAL_POWER_ERROR",
            "The power policy manager experienced a fatal error.",
            vec!["Battery driver issue", "ACPI/BIOS problem", "Power supply issues"],
        ),
        "0X000000BE" | "ATTEMPTED_WRITE_TO_READONLY_MEMORY" => (
            "ATTEMPTED_WRITE_TO_READONLY_MEMORY",
            "A driver attempted to write to read-only memory.",
            vec!["Faulty driver", "RAM failure", "Hardware incompatibility"],
        ),
        "0X000000C2" | "BAD_POOL_CALLER" => (
            "BAD_POOL_CALLER",
            "The current thread is making a bad pool request.",
            vec!["Driver bug", "Antivirus software issue", "Corrupted system memory"],
        ),
        "0X000000D1" | "DRIVER_IRQL_NOT_LESS_OR_EQUAL" => (
            "DRIVER_IRQL_NOT_LESS_OR_EQUAL",
            "A kernel-mode driver attempted to access pageable memory at a process IRQL that was too high.",
            vec!["Faulty device driver", "Incompatible driver", "Driver conflict"],
        ),
        "0X000000EF" | "CRITICAL_PROCESS_DIED" => (
            "CRITICAL_PROCESS_DIED",
            "A critical system process has terminated unexpectedly.",
            vec!["Corrupted system files", "Malware infection", "Failed Windows Update"],
        ),
        "0X000000F4" | "CRITICAL_OBJECT_TERMINATION" => (
            "CRITICAL_OBJECT_TERMINATION",
            "A process or thread crucial to system operation has unexpectedly exited.",
            vec!["Hard drive failure", "System file corruption", "Driver issue"],
        ),
        "0X00000133" | "DPC_WATCHDOG_VIOLATION" => (
            "DPC_WATCHDOG_VIOLATION",
            "A DPC (deferred procedure call) routine took longer than expected.",
            vec!["Storage driver issue (SSD/NVMe)", "Firmware needs update", "Incompatible driver"],
        ),
        "0X00000139" | "KERNEL_SECURITY_CHECK_FAILURE" => (
            "KERNEL_SECURITY_CHECK_FAILURE",
            "The kernel has detected the corruption of a critical data structure.",
            vec!["Memory corruption", "Driver bug", "Malware"],
        ),
        "0X0000013A" | "KERNEL_MODE_HEAP_CORRUPTION" => (
            "KERNEL_MODE_HEAP_CORRUPTION",
            "The kernel mode heap manager has detected corruption in a heap.",
            vec!["Driver memory corruption bug", "Faulty RAM", "Kernel driver issue"],
        ),
        "0X0000019" | "BAD_POOL_HEADER" => (
            "BAD_POOL_HEADER",
            "A pool header is corrupt.",
            vec!["Faulty driver", "RAM issue", "Driver conflict"],
        ),
        "0X0000001A" | "MEMORY_MANAGEMENT" => (
            "MEMORY_MANAGEMENT",
            "A severe memory management error occurred.",
            vec!["RAM failure", "Driver causing memory corruption", "Page file corruption"],
        ),
        "0X00000050" | "PAGE_FAULT_IN_NONPAGED_AREA" => (
            "PAGE_FAULT_IN_NONPAGED_AREA",
            "Invalid system memory was referenced.",
            vec!["Faulty RAM", "Corrupted NTFS volume", "Faulty driver"],
        ),
        "0X000001A" | "PFN_LIST_CORRUPT" => (
            "PFN_LIST_CORRUPT",
            "The page frame number (PFN) list is corrupted.",
            vec!["RAM failure", "Driver bug", "Malware"],
        ),
        "0X0000010E" | "VIDEO_MEMORY_MANAGEMENT_INTERNAL" => (
            "VIDEO_MEMORY_MANAGEMENT_INTERNAL",
            "The video memory manager encountered a condition that it is unable to recover from.",
            vec!["GPU driver crash", "GPU overheating", "Faulty graphics card"],
        ),
        "0X00000116" | "VIDEO_TDR_FAILURE" => (
            "VIDEO_TDR_FAILURE",
            "The display driver failed to respond in a timely fashion.",
            vec!["Outdated GPU driver", "GPU overheating", "Insufficient GPU power"],
        ),
        "0X00000119" | "VIDEO_SCHEDULER_INTERNAL_ERROR" => (
            "VIDEO_SCHEDULER_INTERNAL_ERROR",
            "The video scheduler has detected a fatal violation.",
            vec!["GPU driver issue", "Overclocking problem", "GPU hardware failure"],
        ),
        "0X0000007A" | "KERNEL_DATA_INPAGE_ERROR" => (
            "KERNEL_DATA_INPAGE_ERROR",
            "A page of kernel data could not be read into memory.",
            vec!["Hard drive failure", "Bad sectors on disk", "SATA cable issue"],
        ),
        "0X00000077" | "KERNEL_STACK_INPAGE_ERROR" => (
            "KERNEL_STACK_INPAGE_ERROR",
            "A page of kernel stack could not be paged in from disk.",
            vec!["Hard drive failure", "Bad sectors", "Memory issue"],
        ),
        "0X00000154" | "UNEXPECTED_STORE_EXCEPTION" => (
            "UNEXPECTED_STORE_EXCEPTION",
            "A store component caught an unexpected exception.",
            vec!["SSD/Hard drive issue", "Corrupted system files", "Antivirus conflict"],
        ),
        "0X000001D3" | "DRIVER_PNP_WATCHDOG" => (
            "DRIVER_PNP_WATCHDOG", 
            "A driver has stalled during a PnP operation.",
            vec!["Driver hanging during device enumeration", "Hardware initialization issue"],
        ),
        "0X000001E" | "IRQL_NOT_LESS_OR_EQUAL" => (
            "IRQL_NOT_LESS_OR_EQUAL",
            "A kernel-mode process or driver attempted to access memory at an invalid address.",
            vec!["Faulty device driver", "RAM failure", "Driver conflict"],
        ),
        "0X00000124" | "WHEA_UNCORRECTABLE_ERROR" => (
            "WHEA_UNCORRECTABLE_ERROR",
            "A hardware error has occurred.",
            vec!["CPU failure", "RAM failure", "Motherboard issue", "Overheating"],
        ),
        _ => (
            "Unknown",
            "Unknown stop code. Check Microsoft documentation for more information.",
            vec!["Check Windows Event Log for more details", "Run memory diagnostics", "Update drivers"],
        ),
    };

    (
        Some(name.to_string()),
        Some(desc.to_string()),
        causes.iter().map(|s| s.to_string()).collect(),
    )
}

// ============================================================================
// Commands
// ============================================================================

/// Get list of BSOD crash dumps
#[tauri::command]
pub async fn get_bsod_history() -> Result<Vec<BsodEntry>, String> {
    let minidump_path = PathBuf::from(r"C:\Windows\Minidump");
    let memory_dmp = PathBuf::from(r"C:\Windows\MEMORY.DMP");

    let mut entries = Vec::new();

    // Check minidump folder
    if minidump_path.exists() {
        if let Ok(dir) = fs::read_dir(&minidump_path) {
            for entry in dir.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "dmp").unwrap_or(false) {
                    if let Some(bsod) = parse_dump_basic(&path).await {
                        entries.push(bsod);
                    }
                }
            }
        }
    }

    // Check for full memory dump
    if memory_dmp.exists() {
        if let Some(bsod) = parse_dump_basic(&memory_dmp).await {
            entries.push(bsod);
        }
    }

    // Sort by crash time (newest first)
    entries.sort_by(|a, b| b.crash_time.cmp(&a.crash_time));

    Ok(entries)
}

/// Parse basic information from a dump file
async fn parse_dump_basic(path: &PathBuf) -> Option<BsodEntry> {
    let metadata = fs::metadata(path).ok()?;
    let file_size = metadata.len();

    // Get file modification time as crash time
    let crash_time = metadata
        .modified()
        .ok()
        .map(|t| {
            let datetime: chrono::DateTime<chrono::Utc> = t.into();
            datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        })
        .unwrap_or_else(|| "Unknown".to_string());

    let file_name = path.file_name()?.to_string_lossy().to_string();
    let id = file_name.replace(".dmp", "").replace(".", "_");

    // Try to extract stop code from the dump using PowerShell
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                r#"
                $dump = '{}'
                $bugcheck = Get-Content -Path 'C:\Windows\System32\winevt\Logs\System.evtx' -ErrorAction SilentlyContinue | Out-Null
                
                # Try to get bugcheck info from event log
                $events = Get-WinEvent -FilterHashtable @{{
                    LogName = 'System'
                    ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'
                }} -MaxEvents 50 -ErrorAction SilentlyContinue
                
                $lastCrash = $events | Where-Object {{ $_.Message -match 'bugcheck' }} | Select-Object -First 1
                
                if ($lastCrash) {{
                    $message = $lastCrash.Message
                    if ($message -match 'bugcheck was: (0x[0-9a-fA-F]+)') {{
                        $matches[1]
                    }} elseif ($message -match 'Bug Check Code:\s*(0x[0-9a-fA-F]+)') {{
                        $matches[1]
                    }}
                }}
                "#,
                path.to_string_lossy()
            ),
        ])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stop_code = if stdout.starts_with("0x") {
        stdout
    } else {
        // Try to extract from filename if it's in format like "Mini121624-01.dmp"
        "Unknown".to_string()
    };

    let (stop_code_name, _, _) = get_stop_code_info(&stop_code);

    Some(BsodEntry {
        id,
        dump_path: path.to_string_lossy().to_string(),
        crash_time,
        stop_code: stop_code.clone(),
        stop_code_name,
        faulting_module: None,
        bug_check_code: stop_code,
        parameters: Vec::new(),
        file_size_bytes: file_size,
    })
}

/// Get detailed BSOD analysis for a specific dump
#[tauri::command]
pub async fn get_bsod_details(dump_path: String) -> Result<BsodDetails, String> {
    let path = PathBuf::from(&dump_path);

    if !path.exists() {
        return Err(format!("Dump file not found: {}", dump_path));
    }

    let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read dump file: {}", e))?;

    let crash_time = metadata
        .modified()
        .ok()
        .map(|t| {
            let datetime: chrono::DateTime<chrono::Utc> = t.into();
            datetime.format("%Y-%m-%d %H:%M:%S UTC").to_string()
        })
        .unwrap_or_else(|| "Unknown".to_string());

    // Determine dump type
    let file_size = metadata.len();
    let dump_type = if file_size > 100_000_000 {
        "Full Memory Dump".to_string()
    } else if file_size > 1_000_000 {
        "Kernel Memory Dump".to_string()
    } else {
        "Minidump".to_string()
    };

    // Try to get more info from event logs
    let (stop_code, faulting_module, parameters) = get_crash_info_from_events(&crash_time).await;

    let (stop_code_name, stop_code_description, possible_causes) = get_stop_code_info(&stop_code);

    // Generate recommendations based on the stop code
    let recommendations = generate_recommendations(&stop_code, &faulting_module);

    Ok(BsodDetails {
        dump_path,
        dump_type,
        crash_time,
        uptime_before_crash: None,
        stop_code: stop_code.clone(),
        stop_code_name,
        stop_code_description,
        bug_check_code: stop_code,
        parameters,
        faulting_module: faulting_module.clone(),
        faulting_module_path: None,
        stack_trace: Vec::new(), // Would need WinDbg to extract
        loaded_modules: Vec::new(),
        possible_causes,
        recommendations,
    })
}

/// Get crash info from Windows Event Log
async fn get_crash_info_from_events(crash_time: &str) -> (String, Option<String>, Vec<String>) {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"
            # Get BugCheck events
            $bugcheck = Get-WinEvent -FilterHashtable @{
                LogName = 'System'
                Id = 1001
            } -MaxEvents 5 -ErrorAction SilentlyContinue | Select-Object -First 1

            if ($bugcheck) {
                $msg = $bugcheck.Message
                $result = @{
                    StopCode = ''
                    Module = ''
                    Params = @()
                }
                
                if ($msg -match 'bugcheck was:\s*(0x[0-9a-fA-F]+)') {
                    $result.StopCode = $matches[1]
                }
                if ($msg -match 'dump file in\s+(.+\.dmp)') {
                    $result.DumpPath = $matches[1]
                }
                if ($msg -match '(\w+\.sys)') {
                    $result.Module = $matches[1]
                }
                
                $result | ConvertTo-Json
            }
            "#,
        ])
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stdout) {
            let stop_code = parsed["StopCode"].as_str().unwrap_or("Unknown").to_string();
            let module = parsed["Module"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            return (stop_code, module, Vec::new());
        }
    }

    ("Unknown".to_string(), None, Vec::new())
}

/// Generate recommendations based on stop code and module
fn generate_recommendations(stop_code: &str, module: &Option<String>) -> Vec<String> {
    let mut recs = Vec::new();

    // General recommendations
    recs.push("Run Windows Memory Diagnostic (mdsched.exe) to check for RAM issues".to_string());
    recs.push("Run 'sfc /scannow' in admin Command Prompt to check system files".to_string());

    // Module-specific recommendations
    if let Some(mod_name) = module {
        let mod_lower = mod_name.to_lowercase();

        if mod_lower.contains("nvidia") || mod_lower.contains("nv") {
            recs.insert(
                0,
                "Update NVIDIA graphics drivers from nvidia.com".to_string(),
            );
        } else if mod_lower.contains("amd") || mod_lower.contains("ati") {
            recs.insert(0, "Update AMD graphics drivers from amd.com".to_string());
        } else if mod_lower.contains("intel") {
            recs.insert(
                0,
                "Update Intel drivers from Intel Driver & Support Assistant".to_string(),
            );
        } else if mod_lower.contains("realtek") {
            recs.insert(0, "Update Realtek audio/network drivers".to_string());
        } else if mod_lower.contains("ntfs") || mod_lower.contains("disk") {
            recs.insert(
                0,
                "Run 'chkdsk C: /f /r' to check and repair disk errors".to_string(),
            );
        }
    }

    // Stop code specific recommendations
    let code_upper = stop_code.to_uppercase();
    if code_upper.contains("124") || code_upper.contains("WHEA") {
        recs.insert(
            0,
            "This is usually a hardware error - check CPU/RAM temperatures and stability"
                .to_string(),
        );
    } else if code_upper.contains("50") || code_upper.contains("PAGE_FAULT") {
        recs.insert(
            0,
            "Test RAM with Windows Memory Diagnostic or MemTest86".to_string(),
        );
    } else if code_upper.contains("116") || code_upper.contains("VIDEO_TDR") {
        recs.insert(
            0,
            "Reinstall graphics drivers using DDU (Display Driver Uninstaller)".to_string(),
        );
    }

    recs.push("Check for Windows Updates and install any pending updates".to_string());
    recs.push("If crashes persist, consider a clean Windows installation".to_string());

    recs
}

/// Get BSOD statistics
#[tauri::command]
pub async fn get_bsod_stats() -> Result<BsodStats, String> {
    let entries = get_bsod_history().await?;

    let now = chrono::Utc::now();
    let seven_days_ago = now - chrono::Duration::days(7);
    let thirty_days_ago = now - chrono::Duration::days(30);

    let mut crashes_7d = 0;
    let mut crashes_30d = 0;
    let mut stop_codes: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let mut modules: std::collections::HashMap<String, u32> = std::collections::HashMap::new();

    for entry in &entries {
        // Parse crash time
        if let Ok(crash_dt) = chrono::DateTime::parse_from_rfc3339(&entry.crash_time) {
            let crash_utc = crash_dt.with_timezone(&chrono::Utc);
            if crash_utc > seven_days_ago {
                crashes_7d += 1;
            }
            if crash_utc > thirty_days_ago {
                crashes_30d += 1;
            }
        }

        // Count stop codes
        if entry.stop_code != "Unknown" {
            *stop_codes.entry(entry.stop_code.clone()).or_insert(0) += 1;
        }

        // Count modules
        if let Some(ref module) = entry.faulting_module {
            *modules.entry(module.clone()).or_insert(0) += 1;
        }
    }

    let most_common_stop_code = stop_codes
        .iter()
        .max_by_key(|(_, count)| *count)
        .map(|(code, _)| code.clone());

    let most_common_module = modules
        .iter()
        .max_by_key(|(_, count)| *count)
        .map(|(module, _)| module.clone());

    Ok(BsodStats {
        total_crashes: entries.len() as u32,
        crashes_last_7_days: crashes_7d,
        crashes_last_30_days: crashes_30d,
        most_common_stop_code,
        most_common_module,
        oldest_crash: entries.last().map(|e| e.crash_time.clone()),
        newest_crash: entries.first().map(|e| e.crash_time.clone()),
    })
}

/// Delete a crash dump file
#[tauri::command]
pub async fn delete_crash_dump(dump_path: String) -> Result<(), String> {
    let path = PathBuf::from(&dump_path);

    if !path.exists() {
        return Err("Dump file not found".to_string());
    }

    // Only allow deleting from Minidump folder or MEMORY.DMP
    let path_str = path.to_string_lossy().to_lowercase();
    if !path_str.contains("minidump") && !path_str.contains("memory.dmp") {
        return Err("Can only delete files from Windows\\Minidump or MEMORY.DMP".to_string());
    }

    fs::remove_file(&path).map_err(|e| format!("Failed to delete dump file: {}", e))?;

    Ok(())
}
