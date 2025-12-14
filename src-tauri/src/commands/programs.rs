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
fn extract_icon_from_exe(exe_path: &str, output_path: &PathBuf) -> Result<(), String> {
    use std::mem;
    use std::ptr;
    use widestring::U16CString;
    use winapi::shared::minwindef::DWORD;
    use winapi::um::shellapi::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use winapi::um::wingdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, RGBQUAD,
    };
    use winapi::um::winuser::{DestroyIcon, GetIconInfo, ICONINFO};

    unsafe {
        // Initialize SHFILEINFO struct
        let mut shfi: SHFILEINFOW = mem::zeroed();

        // Convert path to wide string
        let wide_path =
            U16CString::from_str(exe_path).map_err(|e| format!("Failed to convert path: {}", e))?;

        // Get icon from shell
        let result = SHGetFileInfoW(
            wide_path.as_ptr(),
            0,
            &mut shfi,
            mem::size_of::<SHFILEINFOW>() as DWORD,
            SHGFI_ICON | SHGFI_LARGEICON,
        );

        if result == 0 || shfi.hIcon.is_null() {
            return Err("No icon found in file".to_string());
        }

        // Get icon info to access bitmap
        let mut icon_info: ICONINFO = mem::zeroed();
        if GetIconInfo(shfi.hIcon, &mut icon_info) == 0 {
            DestroyIcon(shfi.hIcon);
            return Err("Failed to get icon info".to_string());
        }

        // Get actual bitmap dimensions
        let mut bitmap: BITMAP = mem::zeroed();
        if GetObjectW(
            icon_info.hbmColor as _,
            mem::size_of::<BITMAP>() as i32,
            &mut bitmap as *mut _ as *mut _,
        ) == 0
        {
            DestroyIcon(shfi.hIcon);
            if !icon_info.hbmColor.is_null() {
                DeleteObject(icon_info.hbmColor as _);
            }
            if !icon_info.hbmMask.is_null() {
                DeleteObject(icon_info.hbmMask as _);
            }
            return Err("Failed to get bitmap info".to_string());
        }

        let width = bitmap.bmWidth;
        let height = bitmap.bmHeight;

        // Create compatible DC
        let hdc = CreateCompatibleDC(ptr::null_mut());
        if hdc.is_null() {
            DestroyIcon(shfi.hIcon);
            if !icon_info.hbmColor.is_null() {
                DeleteObject(icon_info.hbmColor as _);
            }
            if !icon_info.hbmMask.is_null() {
                DeleteObject(icon_info.hbmMask as _);
            }
            return Err("Failed to create DC".to_string());
        }

        // Setup bitmap info header with actual dimensions
        let bmp_info_header = BITMAPINFOHEADER {
            biSize: mem::size_of::<BITMAPINFOHEADER>() as DWORD,
            biWidth: width,
            biHeight: -height, // Negative for top-down DIB
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB as DWORD,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        };

        let mut bitmap_info = BITMAPINFO {
            bmiHeader: bmp_info_header,
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }; 1],
        };

        // Allocate buffer for pixel data
        let buffer_size = (width * height * 4) as usize;
        let mut buffer: Vec<u8> = vec![0; buffer_size];

        // Get the bits
        let lines = GetDIBits(
            hdc,
            icon_info.hbmColor,
            0,
            height as u32,
            buffer.as_mut_ptr() as *mut _,
            &mut bitmap_info,
            DIB_RGB_COLORS,
        );

        // Cleanup Windows resources
        DeleteDC(hdc);
        if !icon_info.hbmColor.is_null() {
            DeleteObject(icon_info.hbmColor as _);
        }
        if !icon_info.hbmMask.is_null() {
            DeleteObject(icon_info.hbmMask as _);
        }
        DestroyIcon(shfi.hIcon);

        if lines == 0 {
            return Err("Failed to get bitmap bits".to_string());
        }

        // Convert BGRA to RGBA
        for i in 0..(width * height) as usize {
            let idx = i * 4;
            buffer.swap(idx, idx + 2); // Swap B and R
        }

        // Create image and save as PNG
        let img = image::RgbaImage::from_raw(width as u32, height as u32, buffer)
            .ok_or("Failed to create image from pixels")?;

        img.save(output_path)
            .map_err(|e| format!("Failed to save icon: {}", e))?;

        Ok(())
    }
}

#[cfg(not(windows))]
fn extract_icon_from_exe(_exe_path: &str, _output_path: &PathBuf) -> Result<(), String> {
    Err("Icon extraction is only supported on Windows".to_string())
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

    // Generate unique filename (.png format)
    let icon_filename = format!("{}.png", uuid::Uuid::new_v4());
    let output_path = icons_dir.join(&icon_filename);

    // Extract icon using Windows Shell API
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

/// Get program icon as base64 data URL
#[tauri::command]
pub fn get_program_icon(icon_path: String) -> Result<Option<String>, String> {
    if icon_path.is_empty() {
        return Ok(None);
    }

    let data_dir = super::data_dir::get_data_dir_path();
    let full_path = data_dir.join(&icon_path);

    if !full_path.exists() {
        return Ok(None);
    }

    let data = fs::read(&full_path).map_err(|e| format!("Failed to read icon: {}", e))?;

    use base64::Engine;
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);

    // Determine MIME type from extension
    let mime = if icon_path.ends_with(".png") {
        "image/png"
    } else if icon_path.ends_with(".ico") {
        "image/x-icon"
    } else if icon_path.ends_with(".jpg") || icon_path.ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "image/png"
    };

    Ok(Some(format!("data:{};base64,{}", mime, base64_data)))
}

// =============================================================================
// Legacy Import
// =============================================================================

/// Legacy program format from autoservice
#[derive(Debug, serde::Deserialize)]
struct LegacyProgram {
    #[allow(dead_code)]
    id: String,
    name: String,
    version: String,
    description: String,
    exe_path: String,
    logo_data_url: Option<String>,
    launch_count: u32,
}

/// Import programs from legacy autoservice JSON format
#[tauri::command]
pub fn import_legacy_programs(file_path: String, reset_launch_count: bool) -> Result<u32, String> {
    use base64::Engine;

    // Read JSON file
    let json_content =
        fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    // Parse legacy JSON
    let legacy_programs: Vec<LegacyProgram> = serde_json::from_str(&json_content)
        .map_err(|e| format!("Failed to parse legacy JSON: {}", e))?;

    let mut config = load_programs_config()?;
    let icons_dir = get_icons_dir();
    let data_dir = super::data_dir::get_data_dir_path();

    // Ensure icons directory exists
    if !icons_dir.exists() {
        fs::create_dir_all(&icons_dir)
            .map_err(|e| format!("Failed to create icons directory: {}", e))?;
    }

    let mut imported_count = 0u32;

    for legacy in legacy_programs {
        // Convert legacy exe_path (relative with backslashes) to absolute path
        // Legacy format: "programs\\Folder\\program.exe"
        let exe_path = data_dir.join(&legacy.exe_path.replace("\\", "/"));
        let exe_path_str = exe_path.to_string_lossy().to_string();

        // Handle logo_data_url - extract base64 and save as PNG
        let icon_path = if let Some(data_url) = &legacy.logo_data_url {
            if let Some(base64_start) = data_url.find(",") {
                let base64_data = &data_url[base64_start + 1..];
                if let Ok(icon_bytes) =
                    base64::engine::general_purpose::STANDARD.decode(base64_data)
                {
                    let icon_filename = format!("{}.png", uuid::Uuid::new_v4());
                    let icon_output_path = icons_dir.join(&icon_filename);

                    if fs::write(&icon_output_path, &icon_bytes).is_ok() {
                        Some(format!("programs/icons/{}", icon_filename))
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        // Create new program
        let mut program = Program::new(
            legacy.name,
            legacy.description,
            legacy.version,
            exe_path_str,
            false, // Legacy programs are not CLI-only
        );
        program.icon_path = icon_path;
        program.launch_count = if reset_launch_count {
            0
        } else {
            legacy.launch_count
        };

        config.programs.push(program);
        imported_count += 1;
    }

    save_programs_config(&config)?;

    Ok(imported_count)
}
