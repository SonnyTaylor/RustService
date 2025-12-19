//! MCP Tool Definitions
//!
//! Defines tools exposed via MCP. Tools implement core functionality directly
//! to avoid complex inter-module dependencies.

use rmcp::model::{CallToolResult, Content};
use rmcp::tool;
use std::fs;
use std::path::Path;
use std::process::Command;

// =============================================================================
// Types
// =============================================================================

struct CommandResult {
    exit_code: i32,
    stdout: String,
    stderr: String,
}

struct FileEntry {
    name: String,
    is_dir: bool,
    size: Option<u64>,
}

// =============================================================================
// MCP Tool Handler
// =============================================================================

/// RustService MCP tool handler
#[derive(Clone)]
pub struct RustServiceTools {
    /// Tavily API key for web search
    pub tavily_api_key: Option<String>,
    /// SearXNG URL for web search
    pub searxng_url: Option<String>,
}

impl RustServiceTools {
    pub fn new() -> Self {
        Self {
            tavily_api_key: None,
            searxng_url: None,
        }
    }

    pub fn with_settings(tavily_api_key: Option<String>, searxng_url: Option<String>) -> Self {
        Self {
            tavily_api_key,
            searxng_url,
        }
    }
}

// =============================================================================
// Internal Helper Functions
// =============================================================================

fn execute_shell_command(command: &str) -> Result<CommandResult, String> {
    #[cfg(windows)]
    {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", command])
            .output()
            .map_err(|e| format!("Failed to execute command: {}", e))?;

        Ok(CommandResult {
            exit_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }

    #[cfg(not(windows))]
    {
        let output = Command::new("sh")
            .args(["-c", command])
            .output()
            .map_err(|e| format!("Failed to execute command: {}", e))?;

        Ok(CommandResult {
            exit_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}

fn read_file_contents(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))
}

fn list_directory(path: &str) -> Result<Vec<FileEntry>, String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut result = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let metadata = entry.metadata().ok();
            result.push(FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                is_dir: metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                size: metadata.and_then(|m| if m.is_file() { Some(m.len()) } else { None }),
            });
        }
    }

    Ok(result)
}

// =============================================================================
// MCP Tools
// =============================================================================

#[tool(tool_box)]
impl RustServiceTools {
    /// Execute a PowerShell command on the system
    #[tool(
        description = "Execute a PowerShell command on the system. Returns stdout, stderr, and exit code."
    )]
    pub async fn execute_command(
        &self,
        #[tool(param)] command: String,
        #[tool(param)] reason: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP execute_command: {} ({})", command, reason);

        match execute_shell_command(&command) {
            Ok(result) => {
                let output = if result.exit_code == 0 {
                    format!(
                        "Exit code: {}\n\nOutput:\n{}",
                        result.exit_code, result.stdout
                    )
                } else {
                    format!(
                        "Exit code: {}\n\nStdout:\n{}\n\nStderr:\n{}",
                        result.exit_code, result.stdout, result.stderr
                    )
                };
                Ok(CallToolResult::success(vec![Content::text(output)]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error: {}",
                e
            ))])),
        }
    }

    /// Read the contents of a file
    #[tool(
        description = "Read the contents of a file. Use this to examine configuration files, logs, or other text files."
    )]
    pub async fn read_file(
        &self,
        #[tool(param)] path: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP read_file: {}", path);

        match read_file_contents(&path) {
            Ok(content) => Ok(CallToolResult::success(vec![Content::text(content)])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error reading {}: {}",
                path, e
            ))])),
        }
    }

    /// Write content to a file
    #[tool(description = "Write content to a file. Creates the file if it doesn't exist.")]
    pub async fn write_file(
        &self,
        #[tool(param)] path: String,
        #[tool(param)] content: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP write_file: {}", path);

        match fs::write(&path, &content) {
            Ok(_) => Ok(CallToolResult::success(vec![Content::text(format!(
                "Successfully wrote {} bytes to {}",
                content.len(),
                path
            ))])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error writing {}: {}",
                path, e
            ))])),
        }
    }

    /// List files and directories in a path
    #[tool(
        description = "List files and directories in a specific path. Use this to explore the file system."
    )]
    pub async fn list_dir(
        &self,
        #[tool(param)] path: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP list_dir: {}", path);

        match list_directory(&path) {
            Ok(entries) => {
                let listing: Vec<String> = entries
                    .iter()
                    .map(|e| {
                        let type_indicator = if e.is_dir { "DIR" } else { "FILE" };
                        let size = e
                            .size
                            .map(|s| format!(" ({} bytes)", s))
                            .unwrap_or_default();
                        format!("[{}] {}{}", type_indicator, e.name, size)
                    })
                    .collect();

                let output = if listing.is_empty() {
                    format!("Directory {} is empty", path)
                } else {
                    format!("Contents of {}:\n{}", path, listing.join("\n"))
                };

                Ok(CallToolResult::success(vec![Content::text(output)]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error listing {}: {}",
                path, e
            ))])),
        }
    }

    /// Move or rename a file
    #[tool(description = "Move or rename a file from source to destination.")]
    pub async fn move_file(
        &self,
        #[tool(param)] src: String,
        #[tool(param)] dest: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP move_file: {} -> {}", src, dest);

        match fs::rename(&src, &dest) {
            Ok(_) => Ok(CallToolResult::success(vec![Content::text(format!(
                "Moved {} to {}",
                src, dest
            ))])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error moving file: {}",
                e
            ))])),
        }
    }

    /// Copy a file
    #[tool(description = "Copy a file from source to destination.")]
    pub async fn copy_file(
        &self,
        #[tool(param)] src: String,
        #[tool(param)] dest: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP copy_file: {} -> {}", src, dest);

        match fs::copy(&src, &dest) {
            Ok(bytes) => Ok(CallToolResult::success(vec![Content::text(format!(
                "Copied {} ({} bytes) to {}",
                src, bytes, dest
            ))])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error copying file: {}",
                e
            ))])),
        }
    }

    /// Get system information
    #[tool(
        description = "Get system information including OS version, hostname, and basic system details."
    )]
    pub async fn get_system_info(&self) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP get_system_info");

        // Get basic system info via commands
        let hostname = std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "unknown".to_string());

        let os_info = execute_shell_command("systeminfo | findstr /B /C:\"OS\"")
            .map(|r| r.stdout)
            .unwrap_or_else(|_| "Unknown OS".to_string());

        let info = format!("Hostname: {}\n\n{}", hostname, os_info.trim());

        Ok(CallToolResult::success(vec![Content::text(info)]))
    }

    /// Search the web using configured search provider
    #[tool(
        description = "Search the web for information. Returns search results with titles, URLs, and snippets."
    )]
    pub async fn search_web(
        &self,
        #[tool(param)] query: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP search_web: {}", query);

        // For now, return a message about configuration needed
        // Full implementation would call Tavily/SearXNG APIs
        if self.tavily_api_key.is_some() || self.searxng_url.is_some() {
            // Would implement actual search here
            Ok(CallToolResult::success(vec![Content::text(format!(
                "Search for '{}' would be performed. Search provider configured but full implementation pending.",
                query
            ))]))
        } else {
            Ok(CallToolResult::error(vec![Content::text(
                "No search provider configured. Set up Tavily API key or SearXNG URL in settings.",
            )]))
        }
    }
}
