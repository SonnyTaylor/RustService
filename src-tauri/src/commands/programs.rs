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
// Icon Extraction (Windows-specific)
// =============================================================================

#[cfg(windows)]
mod icon_extraction {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use winapi::shared::windef::HICON;
    use winapi::um::shellapi::ExtractIconExW;
    use winapi::um::wingdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use winapi::um::winuser::{DestroyIcon, GetIconInfo, ICONINFO};

    /// Convert a Rust string to a wide string for Windows API
    fn to_wide_string(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    /// Extract icon from an executable and save as PNG
    pub fn extract_icon_from_exe(exe_path: &str, output_path: &PathBuf) -> Result<(), String> {
        unsafe {
            let wide_path = to_wide_string(exe_path);
            let mut large_icon: HICON = ptr::null_mut();

            // Extract the first large icon
            let count = ExtractIconExW(wide_path.as_ptr(), 0, &mut large_icon, ptr::null_mut(), 1);

            if count == 0 || large_icon.is_null() {
                return Err("No icon found in executable".to_string());
            }

            // Get icon info
            let mut icon_info: ICONINFO = std::mem::zeroed();
            if GetIconInfo(large_icon, &mut icon_info) == 0 {
                DestroyIcon(large_icon);
                return Err("Failed to get icon info".to_string());
            }

            // Get bitmap dimensions
            let hbm_color = icon_info.hbmColor;
            if hbm_color.is_null() {
                DestroyIcon(large_icon);
                if !icon_info.hbmMask.is_null() {
                    DeleteObject(icon_info.hbmMask as _);
                }
                return Err("Icon has no color bitmap".to_string());
            }

            // Create device context
            let hdc = CreateCompatibleDC(ptr::null_mut());
            if hdc.is_null() {
                DestroyIcon(large_icon);
                DeleteObject(hbm_color as _);
                if !icon_info.hbmMask.is_null() {
                    DeleteObject(icon_info.hbmMask as _);
                }
                return Err("Failed to create DC".to_string());
            }

            // Get bitmap info
            let mut bmi: BITMAPINFO = std::mem::zeroed();
            bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;

            // First call to get dimensions
            if GetDIBits(
                hdc,
                hbm_color,
                0,
                0,
                ptr::null_mut(),
                &mut bmi,
                DIB_RGB_COLORS,
            ) == 0
            {
                DeleteDC(hdc);
                DestroyIcon(large_icon);
                DeleteObject(hbm_color as _);
                if !icon_info.hbmMask.is_null() {
                    DeleteObject(icon_info.hbmMask as _);
                }
                return Err("Failed to get bitmap dimensions".to_string());
            }

            let width = bmi.bmiHeader.biWidth as u32;
            let height = bmi.bmiHeader.biHeight.unsigned_abs();

            // Setup for getting actual bits
            bmi.bmiHeader.biCompression = BI_RGB;
            bmi.bmiHeader.biBitCount = 32;
            bmi.bmiHeader.biHeight = -(height as i32); // Top-down

            let mut pixels: Vec<u8> = vec![0; (width * height * 4) as usize];

            let old_obj = SelectObject(hdc, hbm_color as _);

            if GetDIBits(
                hdc,
                hbm_color,
                0,
                height,
                pixels.as_mut_ptr() as _,
                &mut bmi,
                DIB_RGB_COLORS,
            ) == 0
            {
                SelectObject(hdc, old_obj);
                DeleteDC(hdc);
                DestroyIcon(large_icon);
                DeleteObject(hbm_color as _);
                if !icon_info.hbmMask.is_null() {
                    DeleteObject(icon_info.hbmMask as _);
                }
                return Err("Failed to get bitmap bits".to_string());
            }

            // Clean up Windows resources
            SelectObject(hdc, old_obj);
            DeleteDC(hdc);
            DestroyIcon(large_icon);
            DeleteObject(hbm_color as _);
            if !icon_info.hbmMask.is_null() {
                DeleteObject(icon_info.hbmMask as _);
            }

            // Convert BGRA to RGBA
            for chunk in pixels.chunks_mut(4) {
                chunk.swap(0, 2); // Swap B and R
            }

            // Create image and save as PNG
            let img = image::RgbaImage::from_raw(width, height, pixels)
                .ok_or("Failed to create image from pixels")?;

            img.save(output_path)
                .map_err(|e| format!("Failed to save icon: {}", e))?;

            Ok(())
        }
    }
}

#[cfg(not(windows))]
mod icon_extraction {
    use super::*;

    pub fn extract_icon_from_exe(_exe_path: &str, _output_path: &PathBuf) -> Result<(), String> {
        Err("Icon extraction is only supported on Windows".to_string())
    }
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

    // Generate unique filename
    let icon_filename = format!("{}.png", uuid::Uuid::new_v4());
    let output_path = icons_dir.join(&icon_filename);

    // Extract icon
    icon_extraction::extract_icon_from_exe(&exe_path, &output_path)?;

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
