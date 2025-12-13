//! Shortcut commands for launching Windows utilities
//!
//! Provides a Tauri command to open commonly used Windows system tools
//! for computer repair technicians.

use std::process::Command;

/// Opens a Windows shortcut/utility
///
/// # Arguments
/// * `command` - The executable or MSC file to run (e.g., "taskmgr", "devmgmt.msc")
/// * `args` - Optional arguments to pass to the command
/// * `run_as_admin` - Whether to run elevated (uses PowerShell Start-Process -Verb RunAs)
///
/// # Examples
/// - Task Manager: command="taskmgr", args=None
/// - Device Manager: command="devmgmt.msc", args=None
/// - Disk Management: command="diskmgmt.msc", args=None
/// - PowerShell Admin: command="powershell", run_as_admin=true
#[tauri::command]
pub fn open_shortcut(
    command: String,
    args: Option<Vec<String>>,
    run_as_admin: Option<bool>,
) -> Result<(), String> {
    let run_as_admin = run_as_admin.unwrap_or(false);

    if run_as_admin {
        // Use PowerShell to elevate the process
        let mut ps_args = vec![
            "-Command".to_string(),
            "Start-Process".to_string(),
            "-FilePath".to_string(),
            format!("'{}'", command),
            "-Verb".to_string(),
            "RunAs".to_string(),
        ];

        // Add arguments if provided
        if let Some(ref cmd_args) = args {
            if !cmd_args.is_empty() {
                ps_args.push("-ArgumentList".to_string());
                ps_args.push(format!("'{}'", cmd_args.join("', '")));
            }
        }

        Command::new("powershell")
            .args(&ps_args)
            .spawn()
            .map_err(|e| format!("Failed to launch {} as admin: {}", command, e))?;
    } else {
        // Check if it's an MSC file (needs mmc.exe) or regular command
        let (exe, final_args): (&str, Vec<String>) = if command.ends_with(".msc") {
            ("mmc.exe", vec![command.clone()])
        } else if command.ends_with(".cpl") {
            ("control.exe", vec![command.clone()])
        } else {
            (&command, args.unwrap_or_default())
        };

        Command::new(exe)
            .args(&final_args)
            .spawn()
            .map_err(|e| format!("Failed to launch {}: {}", command, e))?;
    }

    Ok(())
}
