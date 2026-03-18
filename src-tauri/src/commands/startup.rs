//! Startup manager commands
//!
//! Commands for managing Windows startup programs from Registry and shell folders.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

// ============================================================================
// Types
// ============================================================================

/// Source location of a startup item
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum StartupSource {
    RegistryCurrentUser,
    RegistryLocalMachine,
    StartupFolderUser,
    StartupFolderAllUsers,
    TaskScheduler,
}

impl std::fmt::Display for StartupSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StartupSource::RegistryCurrentUser => write!(f, "Registry (Current User)"),
            StartupSource::RegistryLocalMachine => write!(f, "Registry (All Users)"),
            StartupSource::StartupFolderUser => write!(f, "Startup Folder (User)"),
            StartupSource::StartupFolderAllUsers => write!(f, "Startup Folder (All Users)"),
            StartupSource::TaskScheduler => write!(f, "Task Scheduler"),
        }
    }
}

/// Startup item information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub command: String,
    pub path: Option<String>,
    pub source: StartupSource,
    pub source_location: String,
    pub enabled: bool,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub impact: StartupImpact,
}

/// Startup impact level
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum StartupImpact {
    High,
    Medium,
    Low,
    Unknown,
}

// ============================================================================
// Commands
// ============================================================================

/// Get all startup items from various sources
#[tauri::command]
pub async fn get_startup_items() -> Result<Vec<StartupItem>, String> {
    let mut items = Vec::new();

    match get_registry_startup_items_sync() {
        Ok(mut registry_items) => items.append(&mut registry_items),
        Err(e) => eprintln!("Failed to get registry startup items: {}", e),
    }

    match get_startup_folder_items_sync() {
        Ok(mut folder_items) => items.append(&mut folder_items),
        Err(e) => eprintln!("Failed to get startup folder items: {}", e),
    }

    match get_scheduled_startup_tasks_sync() {
        Ok(mut task_items) => items.append(&mut task_items),
        Err(e) => eprintln!("Failed to get scheduled startup tasks: {}", e),
    }

    Ok(items)
}

/// Get startup items from registry
pub(crate) fn get_registry_startup_items_sync() -> Result<Vec<StartupItem>, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"
            $items = @()
            
            # Current User Run
            $cuRun = Get-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
            if ($cuRun) {
                $cuRun.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                    $items += [PSCustomObject]@{
                        Name = $_.Name
                        Command = $_.Value
                        Source = 'RegistryCurrentUser'
                        SourceLocation = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
                        Enabled = $true
                    }
                }
            }
            
            # Current User RunOnce (enabled items)
            $cuRunOnce = Get-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce' -ErrorAction SilentlyContinue
            if ($cuRunOnce) {
                $cuRunOnce.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                    $items += [PSCustomObject]@{
                        Name = $_.Name
                        Command = $_.Value
                        Source = 'RegistryCurrentUser'
                        SourceLocation = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce'
                        Enabled = $true
                    }
                }
            }
            
            # Local Machine Run
            $lmRun = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
            if ($lmRun) {
                $lmRun.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                    $items += [PSCustomObject]@{
                        Name = $_.Name
                        Command = $_.Value
                        Source = 'RegistryLocalMachine'
                        SourceLocation = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
                        Enabled = $true
                    }
                }
            }
            
            # Check for disabled items in Startup Approved
            $approvedCU = Get-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' -ErrorAction SilentlyContinue
            $approvedLM = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' -ErrorAction SilentlyContinue
            
            # Update enabled status based on StartupApproved
            foreach ($item in $items) {
                $approved = if ($item.Source -eq 'RegistryCurrentUser') { $approvedCU } else { $approvedLM }
                if ($approved -and $approved.PSObject.Properties[$item.Name]) {
                    $bytes = $approved.($item.Name)
                    if ($bytes -and $bytes.Length -gt 0 -and $bytes[0] -ne 2) {
                        $item.Enabled = $false
                    }
                }
            }
            
            $items | ConvertTo-Json -Depth 3
            "#,
        ])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() || stdout.trim() == "null" {
        return Ok(Vec::new());
    }

    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse registry items: {} - Output: {}", e, stdout))?;

    let raw_items: Vec<serde_json::Value> = if parsed.is_array() {
        parsed.as_array().unwrap().clone()
    } else {
        vec![parsed]
    };

    let mut items = Vec::new();
    for raw in raw_items {
        let name = raw["Name"].as_str().unwrap_or("Unknown").to_string();
        let command = raw["Command"].as_str().unwrap_or("").to_string();
        let source = match raw["Source"].as_str() {
            Some("RegistryCurrentUser") => StartupSource::RegistryCurrentUser,
            Some("RegistryLocalMachine") => StartupSource::RegistryLocalMachine,
            _ => StartupSource::RegistryCurrentUser,
        };
        let enabled = raw["Enabled"].as_bool().unwrap_or(true);

        let path = extract_path_from_command(&command);
        let impact = estimate_impact(&name, &command);

        let publisher = get_file_publisher(path.as_deref());
        items.push(StartupItem {
            id: format!("reg_{}", sanitize_id(&name)),
            name: name.clone(),
            command,
            path,
            source,
            source_location: raw["SourceLocation"].as_str().unwrap_or("").to_string(),
            enabled,
            publisher,
            description: None,
            impact,
        });
    }

    Ok(items)
}

/// Get startup items from shell startup folders
pub(crate) fn get_startup_folder_items_sync() -> Result<Vec<StartupItem>, String> {
    let mut items = Vec::new();

    // User startup folder
    if let Some(user_folder) = dirs::data_local_dir() {
        let startup_path = user_folder
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join("Startup");

        items.extend(scan_startup_folder(
            &startup_path,
            StartupSource::StartupFolderUser,
        )?);
    }

    // All users startup folder
    let all_users_startup =
        PathBuf::from(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup");
    items.extend(scan_startup_folder(
        &all_users_startup,
        StartupSource::StartupFolderAllUsers,
    )?);

    Ok(items)
}

/// Scan a startup folder for items
fn scan_startup_folder(path: &PathBuf, source: StartupSource) -> Result<Vec<StartupItem>, String> {
    let mut items = Vec::new();

    if !path.exists() {
        return Ok(items);
    }

    let entries =
        std::fs::read_dir(path).map_err(|e| format!("Failed to read startup folder: {}", e))?;

    for entry in entries.flatten() {
        let file_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip desktop.ini and hidden files
        if file_name.starts_with('.') || file_name.to_lowercase() == "desktop.ini" {
            continue;
        }

        let name = file_name
            .trim_end_matches(".lnk")
            .trim_end_matches(".url")
            .to_string();
        let command = file_path.to_string_lossy().to_string();
        let impact = estimate_impact(&name, &command);

        items.push(StartupItem {
            id: format!("folder_{}", sanitize_id(&name)),
            name,
            command: command.clone(),
            path: Some(command.clone()),
            source: source.clone(),
            source_location: path.to_string_lossy().to_string(),
            enabled: true, // Folder items are always "enabled" if they exist
            publisher: get_file_publisher(Some(&command)),
            description: None,
            impact,
        });
    }

    Ok(items)
}

/// Get scheduled tasks with startup triggers
pub(crate) fn get_scheduled_startup_tasks_sync() -> Result<Vec<StartupItem>, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"
            Get-ScheduledTask | Where-Object {
                $_.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' -or $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }
            } | ForEach-Object {
                $task = $_
                $info = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue
                [PSCustomObject]@{
                    Name = $task.TaskName
                    Path = $task.TaskPath
                    State = $task.State.ToString()
                    Command = if ($task.Actions.Count -gt 0) { $task.Actions[0].Execute } else { '' }
                    Arguments = if ($task.Actions.Count -gt 0) { $task.Actions[0].Arguments } else { '' }
                    Description = $task.Description
                }
            } | ConvertTo-Json -Depth 3
            "#,
        ])
        .output()
        .map_err(|e| format!("Failed to query scheduled tasks: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() || stdout.trim() == "null" {
        return Ok(Vec::new());
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse tasks: {}", e))?;

    let raw_tasks: Vec<serde_json::Value> = if parsed.is_array() {
        parsed.as_array().unwrap().clone()
    } else {
        vec![parsed]
    };

    let mut items = Vec::new();
    for raw in raw_tasks {
        let name = raw["Name"].as_str().unwrap_or("Unknown").to_string();
        let command = raw["Command"].as_str().unwrap_or("").to_string();
        let args = raw["Arguments"].as_str().unwrap_or("");
        let full_command = if args.is_empty() {
            command.clone()
        } else {
            format!("{} {}", command, args)
        };
        let state = raw["State"].as_str().unwrap_or("Unknown");
        let enabled = state == "Ready" || state == "Running";
        let impact = estimate_impact(&name, &full_command);

        items.push(StartupItem {
            id: format!("task_{}", sanitize_id(&name)),
            name,
            command: full_command,
            path: Some(command),
            source: StartupSource::TaskScheduler,
            source_location: raw["Path"].as_str().unwrap_or("").to_string(),
            enabled,
            publisher: None,
            description: raw["Description"].as_str().map(|s| s.to_string()),
            impact,
        });
    }

    Ok(items)
}

/// Toggle a startup item's enabled state
#[tauri::command]
pub async fn toggle_startup_item(id: String, enabled: bool) -> Result<(), String> {
    // Parse the ID to determine the source
    if let Some(rest) = id.strip_prefix("reg_") {
        toggle_registry_startup_item_sync(rest, enabled)
    } else if let Some(rest) = id.strip_prefix("task_") {
        toggle_scheduled_task_sync(rest, enabled)
    } else if id.starts_with("folder_") {
        Err("Startup folder items cannot be disabled - delete them instead".to_string())
    } else {
        Err(format!("Unknown startup item type: {}", id))
    }
}

/// Toggle a registry startup item
pub(crate) fn toggle_registry_startup_item_sync(name: &str, enabled: bool) -> Result<(), String> {
    // We use the StartupApproved registry key to enable/disable
    let script = if enabled {
        format!(
            r#"
            # Try HKCU first, then HKLM
            $paths = @(
                'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',
                'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
            )
            foreach ($path in $paths) {{
                if (Test-Path $path) {{
                    $item = Get-ItemProperty -Path $path -Name '{}' -ErrorAction SilentlyContinue
                    if ($item) {{
                        # Set bytes to enable (starts with 02)
                        $bytes = [byte[]]@(2,0,0,0,0,0,0,0,0,0,0,0)
                        Set-ItemProperty -Path $path -Name '{}' -Value $bytes -Force
                        break
                    }}
                }}
            }}
            "#,
            name, name
        )
    } else {
        format!(
            r#"
            # Try HKCU first, then HKLM
            $paths = @(
                'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',
                'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
            )
            foreach ($path in $paths) {{
                if (Test-Path $path) {{
                    $item = Get-ItemProperty -Path $path -Name '{}' -ErrorAction SilentlyContinue
                    if ($item) {{
                        # Set bytes to disable (starts with 03)
                        $bytes = [byte[]]@(3,0,0,0,0,0,0,0,0,0,0,0)
                        Set-ItemProperty -Path $path -Name '{}' -Value $bytes -Force
                        break
                    }}
                }}
            }}
            "#,
            name, name
        )
    };

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to toggle startup item: {}", stderr));
    }

    Ok(())
}

/// Toggle a scheduled task
pub(crate) fn toggle_scheduled_task_sync(name: &str, enabled: bool) -> Result<(), String> {
    let action = if enabled { "Enable" } else { "Disable" };

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!("{}-ScheduledTask -TaskName '{}'", action, name),
        ])
        .output()
        .map_err(|e| format!("Failed to {} task: {}", action.to_lowercase(), e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Failed to {} scheduled task: {}",
            action.to_lowercase(),
            stderr
        ));
    }

    Ok(())
}

/// Open the file location of a startup item in Explorer
#[tauri::command]
pub async fn open_startup_item_location(path: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path);

    if file_path.exists() {
        // Use explorer /select to highlight the file
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    } else if let Some(parent) = file_path.parent() {
        if parent.exists() {
            Command::new("explorer")
                .arg(parent.to_string_lossy().as_ref())
                .spawn()
                .map_err(|e| format!("Failed to open Explorer: {}", e))?;
        } else {
            return Err(format!("Path does not exist: {}", path));
        }
    } else {
        return Err(format!("Path does not exist: {}", path));
    }

    Ok(())
}

/// Delete a startup item
#[tauri::command]
pub async fn delete_startup_item(id: String, command: Option<String>) -> Result<(), String> {
    if let Some(rest) = id.strip_prefix("reg_") {
        delete_registry_startup_item(rest).await
    } else if let Some(rest) = id.strip_prefix("folder_") {
        delete_startup_folder_item(rest, command).await
    } else if let Some(rest) = id.strip_prefix("task_") {
        delete_scheduled_task(rest).await
    } else {
        Err(format!("Unknown startup item type: {}", id))
    }
}

/// Delete a registry startup item
async fn delete_registry_startup_item(name: &str) -> Result<(), String> {
    let script = format!(
        r#"
        $paths = @(
            'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
            'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce',
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce'
        )
        $approvedPaths = @(
            'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
        )
        
        foreach ($path in $paths) {{
            Remove-ItemProperty -Path $path -Name '{}' -ErrorAction SilentlyContinue
        }}
        foreach ($path in $approvedPaths) {{
            Remove-ItemProperty -Path $path -Name '{}' -ErrorAction SilentlyContinue
        }}
        "#,
        name, name
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete startup item: {}", stderr));
    }

    Ok(())
}

/// Delete a startup folder item
async fn delete_startup_folder_item(_name: &str, command: Option<String>) -> Result<(), String> {
    let file_path = command
        .ok_or_else(|| "No file path provided for startup folder item".to_string())?;

    let path = std::path::Path::new(&file_path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    // Safety: ensure the file is actually inside a known startup folder
    let allowed_dirs: Vec<PathBuf> = {
        let mut allowed = Vec::new();
        if let Some(local) = dirs::data_local_dir() {
            allowed.push(
                local
                    .join("Microsoft")
                    .join("Windows")
                    .join("Start Menu")
                    .join("Programs")
                    .join("Startup"),
            );
        }
        allowed.push(PathBuf::from(
            r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup",
        ));
        allowed
    };

    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))?;

    let is_in_startup_folder = allowed_dirs.iter().any(|dir| {
        if let Ok(canon_dir) = dir.canonicalize() {
            canonical.starts_with(&canon_dir)
        } else {
            false
        }
    });

    if !is_in_startup_folder {
        return Err(format!(
            "Refusing to delete file outside startup folders: {}",
            file_path
        ));
    }

    std::fs::remove_file(path)
        .map_err(|e| format!("Failed to delete startup item: {}", e))?;

    Ok(())
}

/// Delete a scheduled task
async fn delete_scheduled_task(name: &str) -> Result<(), String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Unregister-ScheduledTask -TaskName '{}' -Confirm:$false",
                name
            ),
        ])
        .output()
        .map_err(|e| format!("Failed to delete task: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete scheduled task: {}", stderr));
    }

    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Sanitize a name for use as an ID
fn sanitize_id(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>()
        .to_lowercase()
}

/// Extract executable path from a command string
fn extract_path_from_command(command: &str) -> Option<String> {
    let cmd = command.trim();

    // Handle quoted paths
    if let Some(rest) = cmd.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return Some(rest[..end].to_string());
        }
    }

    // Handle unquoted paths - take until first space or whole string
    let path = cmd.split_whitespace().next()?;
    Some(path.to_string())
}

/// Estimate startup impact based on known programs
fn estimate_impact(name: &str, _command: &str) -> StartupImpact {
    let name_lower = name.to_lowercase();

    // High impact - known resource-heavy programs
    let high_impact = [
        "steam", "discord", "spotify", "adobe", "office", "teams", "slack", "zoom",
    ];
    if high_impact.iter().any(|&p| name_lower.contains(p)) {
        return StartupImpact::High;
    }

    // Low impact - system utilities
    let low_impact = [
        "defender", "security", "audio", "realtek", "nvidia", "amd", "intel", "logitech",
    ];
    if low_impact.iter().any(|&p| name_lower.contains(p)) {
        return StartupImpact::Low;
    }

    // Medium for everything else known
    StartupImpact::Medium
}

/// Get publisher (CompanyName) from file version info
fn get_file_publisher(exe_path: Option<&str>) -> Option<String> {
    let path = exe_path?;
    if path.is_empty() {
        return None;
    }

    // Only attempt for .exe / .dll files that exist
    let p = std::path::Path::new(path);
    if !p.exists() {
        return None;
    }

    #[cfg(windows)]
    {
        use widestring::U16CString;

        let wide_path = U16CString::from_str(path).ok()?;
        let mut handle: u32 = 0;

        let size = unsafe {
            winapi::um::winver::GetFileVersionInfoSizeW(wide_path.as_ptr(), &mut handle)
        };
        if size == 0 {
            return None;
        }

        let mut buffer: Vec<u8> = vec![0u8; size as usize];
        let success = unsafe {
            winapi::um::winver::GetFileVersionInfoW(
                wide_path.as_ptr(),
                handle,
                size,
                buffer.as_mut_ptr() as *mut _,
            )
        };
        if success == 0 {
            return None;
        }

        // Try common language/codepage combos for CompanyName
        let sub_blocks = [
            "\\StringFileInfo\\040904B0\\CompanyName",  // English US, Unicode
            "\\StringFileInfo\\040904E4\\CompanyName",  // English US, Windows Latin-1
            "\\StringFileInfo\\000004B0\\CompanyName",  // Language neutral, Unicode
        ];

        for sub_block in &sub_blocks {
            let wide_sub = U16CString::from_str(*sub_block).ok()?;
            let mut lp_buffer: *mut winapi::ctypes::c_void = std::ptr::null_mut();
            let mut len: u32 = 0;

            let ok = unsafe {
                winapi::um::winver::VerQueryValueW(
                    buffer.as_ptr() as *const _,
                    wide_sub.as_ptr(),
                    &mut lp_buffer,
                    &mut len,
                )
            };

            if ok != 0 && len > 0 && !lp_buffer.is_null() {
                let slice = unsafe { std::slice::from_raw_parts(lp_buffer as *const u16, len as usize) };
                let company = String::from_utf16_lossy(slice).trim_end_matches('\0').trim().to_string();
                if !company.is_empty() {
                    return Some(company);
                }
            }
        }
    }

    None
}
