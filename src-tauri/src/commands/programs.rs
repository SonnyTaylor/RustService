//! Program management commands
//!
//! Tauri commands for managing portable programs.

use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use tauri_plugin_opener::OpenerExt;

use super::data_dir::get_data_dir_path;
use crate::types::{Program, ProgramConfig};

// =============================================================================
// Helper Functions
// =============================================================================

/// Get the path to programs.json
fn get_programs_config_path() -> PathBuf {
    get_data_dir_path().join("programs.json")
}

/// Get the path to the icons directory
fn get_icons_dir() -> PathBuf {
    get_data_dir_path().join("programs").join("icons")
}

/// Load programs config from disk
fn load_programs_config() -> Result<ProgramConfig, String> {
    let config_path = get_programs_config_path();

    if !config_path.exists() {
        return Ok(ProgramConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read programs config: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse programs config: {}", e))
}

/// Save programs config to disk
fn save_programs_config(config: &ProgramConfig) -> Result<(), String> {
    let config_path = get_programs_config_path();

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize programs config: {}", e))?;

    fs::write(&config_path, content).map_err(|e| format!("Failed to write programs config: {}", e))
}

// =============================================================================
// Icon Extraction
// =============================================================================

/// Extract icon from an executable and save as ICO file
fn extract_icon_from_exe(exe_path: &str, output_path: &PathBuf) -> Result<(), String> {
    let ico_data =
        exeico::get_exe_ico(exe_path).map_err(|e| format!("Failed to extract icon: {}", e))?;

    fs::write(output_path, ico_data).map_err(|e| format!("Failed to write icon file: {}", e))?;

    Ok(())
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Get all programs
#[tauri::command]
pub fn get_programs() -> Result<Vec<Program>, String> {
    let config = load_programs_config()?;
    Ok(config.programs)
}

/// Add a new program
#[tauri::command]
pub fn add_program(
    name: String,
    description: String,
    version: String,
    exe_path: String,
    is_cli: bool,
    icon_path: Option<String>,
) -> Result<Program, String> {
    let mut config = load_programs_config()?;

    let mut program = Program::new(name, description, version, exe_path, is_cli);
    program.icon_path = icon_path;

    config.programs.push(program.clone());
    save_programs_config(&config)?;

    Ok(program)
}

/// Update an existing program
#[tauri::command]
pub fn update_program(
    id: String,
    name: String,
    description: String,
    version: String,
    exe_path: String,
    is_cli: bool,
    icon_path: Option<String>,
) -> Result<Program, String> {
    let mut config = load_programs_config()?;

    let program = config
        .programs
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or("Program not found")?;

    program.name = name;
    program.description = description;
    program.version = version;
    program.exe_path = exe_path;
    program.is_cli = is_cli;
    program.icon_path = icon_path;

    let updated = program.clone();
    save_programs_config(&config)?;

    Ok(updated)
}

/// Delete a program
#[tauri::command]
pub fn delete_program(id: String) -> Result<(), String> {
    let mut config = load_programs_config()?;

    let initial_len = config.programs.len();
    config.programs.retain(|p| p.id != id);

    if config.programs.len() == initial_len {
        return Err("Program not found".to_string());
    }

    save_programs_config(&config)?;
    Ok(())
}

/// Launch a program
#[tauri::command]
pub fn launch_program(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut config = load_programs_config()?;

    let program = config
        .programs
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or("Program not found")?;

    if program.is_cli {
        return Err("Cannot launch CLI programs from GUI".to_string());
    }

    // Launch the program using tauri-plugin-opener
    app.opener()
        .open_path(&program.exe_path, None::<&str>)
        .map_err(|e| format!("Failed to launch program: {}", e))?;

    // Update launch stats
    program.launch_count += 1;
    program.last_launched = Some(Utc::now());

    save_programs_config(&config)?;
    Ok(())
}

/// Extract icon from an executable
#[tauri::command]
pub fn extract_program_icon(exe_path: String) -> Result<String, String> {
    // Ensure icons directory exists
    let icons_dir = get_icons_dir();
    if !icons_dir.exists() {
        fs::create_dir_all(&icons_dir)
            .map_err(|e| format!("Failed to create icons directory: {}", e))?;
    }

    // Generate unique filename (.ico format)
    let icon_filename = format!("{}.ico", uuid::Uuid::new_v4());
    let output_path = icons_dir.join(&icon_filename);

    // Extract icon using exeico
    extract_icon_from_exe(&exe_path, &output_path)?;

    // Return relative path from data directory
    Ok(format!("programs/icons/{}", icon_filename))
}

/// Reveal a program in file explorer
#[tauri::command]
pub fn reveal_program(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let config = load_programs_config()?;

    let program = config
        .programs
        .iter()
        .find(|p| p.id == id)
        .ok_or("Program not found")?;

    app.opener()
        .reveal_item_in_dir(&program.exe_path)
        .map_err(|e| format!("Failed to reveal program: {}", e))?;

    Ok(())
}
