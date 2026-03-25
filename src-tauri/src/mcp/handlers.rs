//! MCP Tool Dispatch Handlers
//!
//! Individual handler functions for each MCP tool, called from the
//! main `dispatch_tool_call` match in `server.rs`.

use serde_json::{Map, Value};

use super::tools::RustServiceTools;

// =============================================================================
// Argument Extraction Helpers
// =============================================================================

/// Extract a required string argument from the JSON arguments map.
pub fn get_string_arg<'a>(arguments: &'a Map<String, Value>, key: &str) -> Result<&'a str, String> {
    arguments
        .get(key)
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Missing required argument: {}", key))
}

/// Extract an optional string argument from the JSON arguments map.
pub fn get_optional_string_arg<'a>(
    arguments: &'a Map<String, Value>,
    key: &str,
) -> Option<&'a str> {
    arguments.get(key).and_then(|v| v.as_str())
}

/// Extract an optional u64 argument, coerced to usize.
fn get_optional_usize_arg(arguments: &Map<String, Value>, key: &str) -> Option<usize> {
    arguments
        .get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
}

/// Extract an optional bool argument.
fn get_optional_bool_arg(arguments: &Map<String, Value>, key: &str) -> Option<bool> {
    arguments.get(key).and_then(|v| v.as_bool())
}

// =============================================================================
// Tool Handlers
// =============================================================================

pub async fn handle_execute_command(
    tools: &RustServiceTools,
    arguments: &Map<String, Value>,
) -> Result<Value, String> {
    let command = get_string_arg(arguments, "command")?;
    let reason = get_optional_string_arg(arguments, "reason").unwrap_or("MCP request");

    let result = tools
        .execute_command(command.to_string(), reason.to_string())
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_read_file(
    tools: &RustServiceTools,
    arguments: &Map<String, Value>,
) -> Result<Value, String> {
    let path = get_string_arg(arguments, "path")?;
    let offset = get_optional_usize_arg(arguments, "offset");
    let limit = get_optional_usize_arg(arguments, "limit");
    let line_numbers = get_optional_bool_arg(arguments, "line_numbers");

    let result = tools
        .read_file(path.to_string(), offset, limit, line_numbers)
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_write_file(
    tools: &RustServiceTools,
    arguments: &Map<String, Value>,
) -> Result<Value, String> {
    let path = get_string_arg(arguments, "path")?;
    let content = get_string_arg(arguments, "content")?;

    let result = tools
        .write_file(path.to_string(), content.to_string())
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_list_dir(
    tools: &RustServiceTools,
    arguments: &Map<String, Value>,
) -> Result<Value, String> {
    let path = get_string_arg(arguments, "path")?;

    let result = tools
        .list_dir(path.to_string())
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_move_file(
    tools: &RustServiceTools,
    arguments: &Map<String, Value>,
) -> Result<Value, String> {
    let src = get_string_arg(arguments, "src")?;
    let dest = get_string_arg(arguments, "dest")?;

    let result = tools
        .move_file(src.to_string(), dest.to_string())
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_copy_file(
    tools: &RustServiceTools,
    arguments: &Map<String, Value>,
) -> Result<Value, String> {
    let src = get_string_arg(arguments, "src")?;
    let dest = get_string_arg(arguments, "dest")?;

    let result = tools
        .copy_file(src.to_string(), dest.to_string())
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_get_system_info(
    tools: &RustServiceTools,
) -> Result<Value, String> {
    let result = tools
        .get_system_info()
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_search_web(
    tools: &RustServiceTools,
    arguments: &Map<String, Value>,
) -> Result<Value, String> {
    let query = get_string_arg(arguments, "query")?;

    let result = tools
        .search_web(query.to_string())
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_list_programs(
    tools: &RustServiceTools,
) -> Result<Value, String> {
    let result = tools
        .list_programs()
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_list_instruments(
    tools: &RustServiceTools,
) -> Result<Value, String> {
    let result = tools
        .list_instruments()
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}

pub async fn handle_run_instrument(
    tools: &RustServiceTools,
    arguments: &Map<String, Value>,
) -> Result<Value, String> {
    let name = get_string_arg(arguments, "name")?;
    let args = get_optional_string_arg(arguments, "args").map(String::from);

    let result = tools
        .run_instrument(name.to_string(), args)
        .await
        .map_err(|e| format!("Tool error: {:?}", e))?;

    Ok(super::server::call_tool_result_to_json(result))
}
