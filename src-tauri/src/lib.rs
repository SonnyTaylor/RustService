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
mod services;
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_data_dir,
            commands::ensure_data_dir,
            commands::get_settings,
            commands::save_settings,
            commands::update_setting,
            commands::open_folder,
            commands::open_shortcut,
            commands::get_system_info,
            commands::test_network_latency,
            commands::get_programs,
            commands::add_program,
            commands::update_program,
            commands::delete_program,
            commands::launch_program,
            commands::extract_program_icon,
            commands::reveal_program,
            commands::get_program_icon,
            commands::import_legacy_programs,
            commands::get_scripts,
            commands::add_script,
            commands::update_script,
            commands::delete_script,
            commands::run_script,
            // Service commands
            commands::get_service_definitions,
            commands::get_service_presets,
            commands::validate_service_requirements,
            commands::get_service_run_state,
            commands::run_services,
            commands::cancel_service_run,
            commands::get_service_report,
            commands::list_service_reports,
            commands::delete_report,
            commands::clear_all_reports,
            // Required programs commands
            commands::get_required_programs,
            commands::get_required_programs_by_ids,
            commands::get_required_programs_status,
            commands::set_program_path_override,
            commands::get_program_exe_path,
            commands::validate_required_programs,
            // Business logo commands
            commands::save_business_logo,
            commands::get_business_logo,
            // Service time tracking commands
            commands::get_service_time_metrics,
            commands::record_service_time,
            commands::get_pc_fingerprint,
            commands::get_estimated_time,
            commands::get_service_averages,
            commands::get_preset_averages,
            commands::clear_service_metrics,
            commands::retrain_time_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
