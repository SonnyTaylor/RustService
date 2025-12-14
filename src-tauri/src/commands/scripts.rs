//! Script management commands
//!
//! Tauri commands for managing and executing PowerShell/CMD scripts.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use chrono::Utc;

use super::data_dir::get_data_dir_path;
use crate::types::{Script, ScriptConfig, ScriptType};

// =============================================================================
// Helper Functions
// =============================================================================

/// Get the path to scripts.json
fn get_scripts_config_path() -> PathBuf {
    get_data_dir_path().join("scripts.json")
}

/// Load scripts config from disk
fn load_scripts_config() -> Result<ScriptConfig, String> {
    let config_path = get_scripts_config_path();

    if !config_path.exists() {
        return Ok(ScriptConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read scripts config: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse scripts config: {}", e))
}

/// Save scripts config to disk
fn save_scripts_config(config: &ScriptConfig) -> Result<(), String> {
    let config_path = get_scripts_config_path();

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize scripts config: {}", e))?;

    fs::write(&config_path, content).map_err(|e| format!("Failed to write scripts config: {}", e))
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Get all scripts
#[tauri::command]
pub fn get_scripts() -> Result<Vec<Script>, String> {
    let config = load_scripts_config()?;
    Ok(config.scripts)
}

/// Add a new script
#[tauri::command]
pub fn add_script(
    name: String,
    description: String,
    script_type: ScriptType,
    content: String,
    run_as_admin: bool,
) -> Result<Script, String> {
    let mut config = load_scripts_config()?;

    let script = Script::new(name, description, script_type, content, run_as_admin);

    config.scripts.push(script.clone());
    save_scripts_config(&config)?;

    Ok(script)
}

/// Update an existing script
#[tauri::command]
pub fn update_script(
    id: String,
    name: String,
    description: String,
    script_type: ScriptType,
    content: String,
    run_as_admin: bool,
) -> Result<Script, String> {
    let mut config = load_scripts_config()?;

    let script = config
        .scripts
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or("Script not found")?;

    script.name = name;
    script.description = description;
    script.script_type = script_type;
    script.content = content;
    script.run_as_admin = run_as_admin;

    let updated = script.clone();
    save_scripts_config(&config)?;

    Ok(updated)
}

/// Delete a script
#[tauri::command]
pub fn delete_script(id: String) -> Result<(), String> {
    let mut config = load_scripts_config()?;

    let initial_len = config.scripts.len();
    config.scripts.retain(|s| s.id != id);

    if config.scripts.len() == initial_len {
        return Err("Script not found".to_string());
    }

    save_scripts_config(&config)?;
    Ok(())
}

/// Run a script - opens a terminal window with the command
#[tauri::command]
pub fn run_script(id: String) -> Result<(), String> {
    let mut config = load_scripts_config()?;

    let script = config
        .scripts
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or("Script not found")?;

    // Open terminal window with the script
    match script.script_type {
        ScriptType::PowerShell => {
            open_powershell_window(&script.content, script.run_as_admin)?;
        }
        ScriptType::Cmd => {
            open_cmd_window(&script.content, script.run_as_admin)?;
        }
    }

    // Update run stats
    script.run_count += 1;
    script.last_run = Some(Utc::now());
    save_scripts_config(&config)?;

    Ok(())
}

/// Open a PowerShell window with the script content
#[cfg(windows)]
fn open_powershell_window(content: &str, run_as_admin: bool) -> Result<(), String> {
    // Create a temp script file
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join(format!("rustservice_{}.ps1", uuid::Uuid::new_v4()));

    fs::write(&script_path, content).map_err(|e| format!("Failed to create temp script: {}", e))?;

    if run_as_admin {
        // Open elevated PowerShell with the script
        Command::new("powershell")
            .args([
                "-Command",
                &format!(
                    "Start-Process powershell -Verb RunAs -ArgumentList '-NoExit -ExecutionPolicy Bypass -File \"{}\"'",
                    script_path.display()
                ),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open PowerShell: {}", e))?;
    } else {
        // Open normal PowerShell with the script
        Command::new("powershell")
            .args([
                "-NoExit",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                &script_path.to_string_lossy(),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open PowerShell: {}", e))?;
    }

    Ok(())
}

#[cfg(not(windows))]
fn open_powershell_window(_content: &str, _run_as_admin: bool) -> Result<(), String> {
    Err("PowerShell is only supported on Windows".to_string())
}

/// Open a CMD window with the script content
#[cfg(windows)]
fn open_cmd_window(content: &str, run_as_admin: bool) -> Result<(), String> {
    // Create a temp batch file
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join(format!("rustservice_{}.bat", uuid::Uuid::new_v4()));

    // Add pause at the end so the window stays open
    let batch_content = format!("{}\npause", content);
    fs::write(&script_path, batch_content)
        .map_err(|e| format!("Failed to create temp script: {}", e))?;

    if run_as_admin {
        // Open elevated CMD with the script
        Command::new("powershell")
            .args([
                "-Command",
                &format!(
                    "Start-Process cmd -Verb RunAs -ArgumentList '/k \"{}\"'",
                    script_path.display()
                ),
            ])
            .spawn()
            .map_err(|e| format!("Failed to open CMD: {}", e))?;
    } else {
        // Open normal CMD with the script
        Command::new("cmd")
            .args(["/k", &script_path.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("Failed to open CMD: {}", e))?;
    }

    Ok(())
}

#[cfg(not(windows))]
fn open_cmd_window(_content: &str, _run_as_admin: bool) -> Result<(), String> {
    Err("CMD is only supported on Windows".to_string())
}
