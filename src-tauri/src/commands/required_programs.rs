//! Required programs commands
//!
//! Tauri commands for managing required external programs.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::LazyLock;

use super::data_dir::get_data_dir_path;
use super::settings::{get_settings, save_settings};
use crate::types::{RequiredProgramDef, RequiredProgramStatus};

// =============================================================================
// Required Programs Registry
// =============================================================================

/// Static registry of all known required programs
static REQUIRED_PROGRAMS: LazyLock<HashMap<String, RequiredProgramDef>> = LazyLock::new(|| {
    let programs = vec![
        RequiredProgramDef {
            id: "bleachbit".to_string(),
            name: "BleachBit".to_string(),
            description: "System cleaner to free disk space and maintain privacy".to_string(),
            exe_names: vec![
                "bleachbit.exe".to_string(),
                "bleachbit_console.exe".to_string(),
            ],
            url: Some("https://www.bleachbit.org/".to_string()),
        },
        RequiredProgramDef {
            id: "adwcleaner".to_string(),
            name: "AdwCleaner".to_string(),
            description: "Adware and malware removal tool".to_string(),
            exe_names: vec!["adwcleaner.exe".to_string()],
            url: Some("https://www.malwarebytes.com/adwcleaner".to_string()),
        },
        RequiredProgramDef {
            id: "crystaldiskinfo".to_string(),
            name: "CrystalDiskInfo".to_string(),
            description: "Disk health monitoring utility".to_string(),
            exe_names: vec![
                "DiskInfo64.exe".to_string(),
                "DiskInfo32.exe".to_string(),
                "CrystalDiskInfo.exe".to_string(),
            ],
            url: Some("https://crystalmark.info/en/software/crystaldiskinfo/".to_string()),
        },
        // Add more programs here as services require them
    ];

    programs.into_iter().map(|p| (p.id.clone(), p)).collect()
});

// =============================================================================
// Helper Functions
// =============================================================================

/// Search for an executable in the data/programs folder recursively
fn find_exe_in_programs_folder(exe_names: &[String]) -> Option<PathBuf> {
    let programs_dir = get_data_dir_path().join("programs");
    if !programs_dir.exists() {
        return None;
    }

    find_exe_recursive(&programs_dir, exe_names)
}

fn find_exe_recursive(dir: &PathBuf, exe_names: &[String]) -> Option<PathBuf> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return None,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_exe_recursive(&path, exe_names) {
                return Some(found);
            }
        } else if path.is_file() {
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                let file_lower = file_name.to_lowercase();
                for exe_name in exe_names {
                    if file_lower == exe_name.to_lowercase() {
                        return Some(path);
                    }
                }
            }
        }
    }

    None
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Get all required program definitions
#[tauri::command]
pub fn get_required_programs() -> Vec<RequiredProgramDef> {
    REQUIRED_PROGRAMS.values().cloned().collect()
}

/// Get required program definitions for specific IDs only
#[tauri::command]
pub fn get_required_programs_by_ids(ids: Vec<String>) -> Vec<RequiredProgramDef> {
    ids.iter()
        .filter_map(|id| REQUIRED_PROGRAMS.get(id).cloned())
        .collect()
}

/// Get the status of all required programs (found/not found, paths)
#[tauri::command]
pub fn get_required_programs_status() -> Result<Vec<RequiredProgramStatus>, String> {
    let settings = get_settings()?;
    let overrides = &settings.programs.overrides;

    let mut statuses: Vec<RequiredProgramStatus> = Vec::new();

    for def in REQUIRED_PROGRAMS.values() {
        // Check for user override first
        if let Some(custom_path) = overrides.get(&def.id) {
            let path = PathBuf::from(custom_path);
            let found = path.exists() && path.is_file();
            statuses.push(RequiredProgramStatus {
                definition: def.clone(),
                found,
                path: Some(custom_path.clone()),
                is_custom: true,
            });
            continue;
        }

        // Auto-detect in programs folder
        if let Some(found_path) = find_exe_in_programs_folder(&def.exe_names) {
            statuses.push(RequiredProgramStatus {
                definition: def.clone(),
                found: true,
                path: Some(found_path.to_string_lossy().to_string()),
                is_custom: false,
            });
        } else {
            statuses.push(RequiredProgramStatus {
                definition: def.clone(),
                found: false,
                path: None,
                is_custom: false,
            });
        }
    }

    // Sort by name for consistent display
    statuses.sort_by(|a, b| a.definition.name.cmp(&b.definition.name));

    Ok(statuses)
}

/// Set a custom path override for a required program
#[tauri::command]
pub fn set_program_path_override(program_id: String, path: Option<String>) -> Result<(), String> {
    let mut settings = get_settings()?;

    match path {
        Some(p) if !p.trim().is_empty() => {
            settings.programs.overrides.insert(program_id, p);
        }
        _ => {
            settings.programs.overrides.remove(&program_id);
        }
    }

    save_settings(settings)?;
    Ok(())
}

/// Get the resolved executable path for a required program (for service execution)
#[tauri::command]
pub fn get_program_exe_path(program_id: String) -> Result<Option<String>, String> {
    let settings = get_settings()?;

    // Check override first
    if let Some(custom_path) = settings.programs.overrides.get(&program_id) {
        let path = PathBuf::from(custom_path);
        if path.exists() && path.is_file() {
            return Ok(Some(custom_path.clone()));
        }
    }

    // Auto-detect
    if let Some(def) = REQUIRED_PROGRAMS.get(&program_id) {
        if let Some(found_path) = find_exe_in_programs_folder(&def.exe_names) {
            return Ok(Some(found_path.to_string_lossy().to_string()));
        }
    }

    Ok(None)
}

/// Validate that required programs are available for given service IDs
#[tauri::command]
pub fn validate_required_programs(
    required_ids: Vec<String>,
) -> Result<HashMap<String, bool>, String> {
    let settings = get_settings()?;
    let overrides = &settings.programs.overrides;

    let mut result: HashMap<String, bool> = HashMap::new();

    for id in required_ids {
        // Check override first
        if let Some(custom_path) = overrides.get(&id) {
            let path = PathBuf::from(custom_path);
            result.insert(id, path.exists() && path.is_file());
            continue;
        }

        // Auto-detect
        if let Some(def) = REQUIRED_PROGRAMS.get(&id) {
            let found = find_exe_in_programs_folder(&def.exe_names).is_some();
            result.insert(id, found);
        } else {
            // Unknown program ID
            result.insert(id, false);
        }
    }

    Ok(result)
}
