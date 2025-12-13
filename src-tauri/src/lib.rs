//! RustService Backend Library
//!
//! Tauri backend for the RustService Windows desktop toolkit.
//! Handles system operations, data folder management, settings persistence,
//! and system information collection.
//!
//! # Module Structure
//!
//! - `types` - Data structures for settings and system information
//! - `commands` - Tauri command handlers exposed to the frontend

mod commands;
mod types;

// Re-export types for use by commands
pub use types::*;

// Re-export commands for registration
pub use commands::*;

// ============================================================================
// Application Entry Point
// ============================================================================

/// Tauri application entry point
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_data_dir,
            commands::ensure_data_dir,
            commands::get_settings,
            commands::save_settings,
            commands::open_folder,
            commands::get_system_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
