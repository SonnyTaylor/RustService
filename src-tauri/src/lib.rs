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
//! - `mcp` - Model Context Protocol server for remote LLM access

mod commands;
mod mcp;
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
    // Load settings and start MCP server in background if enabled
    if let Ok(settings) = get_settings() {
        if settings.agent.mcp_server_enabled {
            if let Some(api_key) = settings.agent.mcp_api_key {
                eprintln!("[MCP] Starting server on port {}", settings.agent.mcp_port);
                mcp::start_mcp_server_background(
                    settings.agent.mcp_port,
                    api_key,
                    settings.agent.tavily_api_key,
                    settings.agent.searxng_url,
                );
            } else {
                eprintln!("[MCP] Server enabled but no API key configured");
            }
        }
    }

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
            // Service presets management
            commands::save_service_preset,
            commands::delete_service_preset,
            commands::get_builtin_preset_ids,
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
            commands::retrain_time_models,
            commands::flush_service_metrics,
            // Network diagnostics commands
            commands::get_detailed_network_info,
            commands::ping_host,
            commands::trace_route,
            commands::dns_lookup,
            commands::get_wifi_info,
            // Startup manager commands
            commands::get_startup_items,
            commands::toggle_startup_item,
            commands::delete_startup_item,
            // Event log commands
            commands::get_event_log_sources,
            commands::get_event_logs,
            commands::get_event_log_stats,
            commands::search_event_logs,
            // Bluescreen analysis commands
            commands::get_bsod_history,
            commands::get_bsod_details,
            commands::get_bsod_stats,
            commands::delete_crash_dump,
            // Agent commands
            commands::queue_agent_command,
            commands::execute_agent_command,
            commands::get_pending_commands,
            commands::clear_pending_commands,
            commands::approve_command,
            commands::reject_command,
            commands::search_tavily,
            commands::search_searxng,
            commands::get_agent_settings,
            commands::get_command_history,
            commands::agent_read_file,
            commands::agent_write_file,
            commands::agent_list_dir,
            commands::agent_move_file,
            commands::agent_copy_file,
            commands::agent_edit_file,
            commands::agent_grep,
            commands::agent_glob,
            commands::list_instruments,
            commands::list_agent_programs,
            // File attachment commands
            commands::save_uploaded_file,
            commands::generate_agent_file,
            commands::read_file_content,
            commands::read_file_binary,
            commands::get_file_info,
            commands::list_agent_files,
            commands::delete_agent_file,
            commands::validate_filesystem_path,
            commands::read_filesystem_file,
            // Conversation commands
            commands::create_conversation,
            commands::list_conversations,
            commands::get_conversation,
            commands::save_conversation_messages,
            commands::update_conversation_title,
            commands::delete_conversation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
