//! MCP Tool Definitions
//!
//! Defines tools exposed via MCP. Tools implement core functionality directly
//! to avoid complex inter-module dependencies.

use glob;
use regex;
use rmcp::model::{CallToolResult, Content};
use rmcp::tool;
use std::fs;
use std::path::Path;
use std::process::Command;
use sysinfo::System;

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

struct ProgramInfo {
    name: String,
    path: String,
    executables: Vec<String>,
}

struct InstrumentInfo {
    name: String,
    path: String,
    extension: String,
    description: String,
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
    #[allow(dead_code)]
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

fn get_data_dir() -> std::path::PathBuf {
    // In development, data folder is in src-tauri/data
    // In production, it's next to the executable
    if cfg!(debug_assertions) {
        std::path::PathBuf::from("data")
    } else {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("data")
    }
}

fn collect_exes_recursive_mcp(dir: &Path, root: &Path, acc: &mut Vec<String>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                collect_exes_recursive_mcp(&p, root, acc);
            } else if p.extension().map(|e| e == "exe").unwrap_or(false) {
                if let Ok(rel) = p.strip_prefix(root) {
                    acc.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
}

fn list_programs_in_folder() -> Result<Vec<ProgramInfo>, String> {
    let programs_dir = get_data_dir().join("programs");
    if !programs_dir.exists() {
        return Ok(Vec::new());
    }

    let mut programs = Vec::new();

    // Iterate over top-level folders in programs/
    if let Ok(entries) = fs::read_dir(&programs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                // Recursively find all executables in this program's folder
                let mut executables = Vec::new();
                collect_exes_recursive_mcp(&path, &path, &mut executables);

                programs.push(ProgramInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    executables,
                });
            }
        }
    }

    Ok(programs)
}

fn list_instruments_in_folder() -> Result<Vec<InstrumentInfo>, String> {
    let instruments_dir = get_data_dir().join("instruments");
    if !instruments_dir.exists() {
        return Ok(Vec::new());
    }

    let mut instruments = Vec::new();
    let valid_extensions = ["ps1", "bat", "cmd", "py", "js", "exe"];

    if let Ok(entries) = fs::read_dir(&instruments_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if valid_extensions.contains(&ext_str.as_str()) {
                        let name = path
                            .file_stem()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();

                        let description = format!("Custom {} instrument", ext_str.to_uppercase());
                        instruments.push(InstrumentInfo {
                            name,
                            path: path.to_string_lossy().to_string(),
                            extension: ext_str,
                            description,
                        });
                    }
                }
            }
        }
    }

    Ok(instruments)
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
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

    /// Read the contents of a file with optional pagination
    #[tool(
        description = "Read the contents of a file with optional line numbers and pagination. Use this to examine configuration files, logs, or other text files."
    )]
    pub async fn read_file(
        &self,
        #[tool(param)] path: String,
        #[tool(param)] offset: Option<usize>,
        #[tool(param)] limit: Option<usize>,
        #[tool(param)] line_numbers: Option<bool>,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP read_file: {}", path);

        match read_file_contents(&path) {
            Ok(content) => {
                let lines: Vec<&str> = content.lines().collect();
                let total_lines = lines.len();
                let offset_val = offset.unwrap_or(0);
                let limit_val = limit.unwrap_or(total_lines);
                let end = std::cmp::min(offset_val + limit_val, total_lines);

                let selected: Vec<&str> = if offset_val < total_lines {
                    lines[offset_val..end].to_vec()
                } else {
                    Vec::new()
                };

                let show_line_numbers = line_numbers.unwrap_or(true);
                let formatted = if show_line_numbers {
                    selected
                        .iter()
                        .enumerate()
                        .map(|(idx, line)| format!("{:4}| {}", offset_val + idx + 1, line))
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    selected.join("\n")
                };

                let has_more = end < total_lines;
                let result = if has_more {
                    format!("{}\n\n[{} more lines...]", formatted, total_lines - end)
                } else {
                    formatted
                };

                Ok(CallToolResult::success(vec![Content::text(result)]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error reading {}: {}",
                path, e
            ))])),
        }
    }

    /// Edit a file by replacing old_string with new_string
    #[tool(
        description = "Edit a file by replacing old_string with new_string. The old_string must be unique in the file unless all=true is specified. Use this for targeted edits instead of rewriting entire files."
    )]
    pub async fn edit_file(
        &self,
        #[tool(param)] path: String,
        #[tool(param)] old_string: String,
        #[tool(param)] new_string: String,
        #[tool(param)] all: Option<bool>,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP edit_file: {}", path);

        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Error reading file: {}",
                    e
                ))]));
            }
        };

        let replace_all = all.unwrap_or(false);

        if !text.contains(&old_string) {
            return Ok(CallToolResult::error(vec![Content::text(
                "Error: old_string not found in file",
            )]));
        }

        let count = text.matches(&old_string).count();
        if !replace_all && count > 1 {
            return Ok(CallToolResult::error(vec![Content::text(format!(
                "Error: old_string appears {} times, must be unique (use all=true)",
                count
            ))]));
        }

        let replacement = if replace_all {
            text.replace(&old_string, &new_string)
        } else {
            text.replacen(&old_string, &new_string, 1)
        };

        match fs::write(&path, replacement) {
            Ok(_) => {
                let replacements = if replace_all { count } else { 1 };
                Ok(CallToolResult::success(vec![Content::text(format!(
                    "Successfully made {} replacement{} in {}",
                    replacements,
                    if replacements > 1 { "s" } else { "" },
                    path
                ))]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error writing file: {}",
                e
            ))])),
        }
    }

    /// Search for a regex pattern across files
    #[tool(
        description = "Search for a regex pattern across files in a directory. Returns matching lines with file paths and line numbers."
    )]
    pub async fn grep(
        &self,
        #[tool(param)] pattern: String,
        #[tool(param)] path: Option<String>,
        #[tool(param)] file_pattern: Option<String>,
        #[tool(param)] max_results: Option<usize>,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP grep: {}", pattern);

        let regex = match regex::Regex::new(&pattern) {
            Ok(r) => r,
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Invalid regex pattern: {}",
                    e
                ))]));
            }
        };

        let base_path = path.unwrap_or_else(|| ".".to_string());
        let max = max_results.unwrap_or(50);
        let glob_pat = file_pattern.unwrap_or_else(|| "*".to_string());
        let full_pattern = format!("{}/**/ {}", base_path, glob_pat);

        let mut results = Vec::new();

        let glob_result = match glob::glob(&full_pattern) {
            Ok(g) => g,
            Err(_) => {
                return Ok(CallToolResult::success(vec![Content::text(format!(
                    "Invalid glob pattern: '{}'",
                    pattern
                ))]));
            }
        };

        for entry in glob_result.flatten() {
            if !entry.is_file() {
                continue;
            }

            if let Ok(content) = fs::read_to_string(&entry) {
                for (line_num, line) in content.lines().enumerate() {
                    if regex.is_match(line) {
                        results.push(format!(
                            "{}:{}: {}",
                            entry.to_string_lossy(),
                            line_num + 1,
                            line
                        ));

                        if results.len() >= max {
                            break;
                        }
                    }
                }
            }

            if results.len() >= max {
                break;
            }
        }

        if results.is_empty() {
            Ok(CallToolResult::success(vec![Content::text(format!(
                "No matches found for pattern '{}'",
                pattern
            ))]))
        } else {
            Ok(CallToolResult::success(vec![Content::text(format!(
                "Found {} match{}:\n\n{}",
                results.len(),
                if results.len() > 1 { "es" } else { "" },
                results.join("\n")
            ))]))
        }
    }

    /// Find files matching a glob pattern
    #[tool(
        description = "Find files matching a glob pattern, sorted by modification time (newest first)."
    )]
    pub async fn glob(
        &self,
        #[tool(param)] pattern: String,
        #[tool(param)] path: Option<String>,
        #[tool(param)] limit: Option<usize>,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP glob: {}", pattern);

        let base_path = path.unwrap_or_else(|| ".".to_string());
        let max = limit.unwrap_or(100);
        let full_pattern = format!("{}/{}", base_path, pattern);

        let mut files: Vec<(std::path::PathBuf, std::time::SystemTime, u64)> = Vec::new();

        let glob_result = match glob::glob(&full_pattern) {
            Ok(g) => g,
            Err(_) => {
                return Ok(CallToolResult::success(vec![Content::text(format!(
                    "Invalid glob pattern: '{}'",
                    pattern
                ))]));
            }
        };

        for entry in glob_result.flatten() {
            if let Ok(metadata) = fs::metadata(&entry) {
                let mtime = metadata
                    .modified()
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                let size = metadata.len();
                files.push((entry, mtime, size));
            }
        }

        // Sort by modification time (newest first)
        files.sort_by(|a, b| b.1.cmp(&a.1));

        let formatted: Vec<String> = files
            .into_iter()
            .take(max)
            .map(|(path, _mtime, size)| {
                format!("{} ({})", path.to_string_lossy(), format_bytes(size))
            })
            .collect();

        if formatted.is_empty() {
            Ok(CallToolResult::success(vec![Content::text(format!(
                "No files found matching pattern '{}'",
                pattern
            ))]))
        } else {
            Ok(CallToolResult::success(vec![Content::text(format!(
                "Found {} file{}:\n\n{}",
                formatted.len(),
                if formatted.len() > 1 { "s" } else { "" },
                formatted.join("\n")
            ))]))
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

        // Create parent directories if they don't exist
        if let Some(parent) = Path::new(&path).parent() {
            if !parent.exists() {
                if let Err(e) = fs::create_dir_all(parent) {
                    return Ok(CallToolResult::error(vec![Content::text(format!(
                        "Error creating directories: {}",
                        e
                    ))]));
                }
            }
        }

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
                            .map(|s| format!(" ({})", format_bytes(s)))
                            .unwrap_or_default();
                        format!("[{}] {}{}", type_indicator, e.name, size)
                    })
                    .collect();

                let output = if listing.is_empty() {
                    format!("Directory {} is empty", path)
                } else {
                    format!(
                        "Contents of {} ({} items):\n{}",
                        path,
                        listing.len(),
                        listing.join("\n")
                    )
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
                "Copied {} ({}) to {}",
                src,
                format_bytes(bytes),
                dest
            ))])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error copying file: {}",
                e
            ))])),
        }
    }

    /// Get system information
    #[tool(
        description = "Get detailed system information including OS version, CPU, memory, disks, and hostname."
    )]
    pub async fn get_system_info(&self) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP get_system_info");

        // Get comprehensive system info using sysinfo crate
        let mut sys = System::new_all();
        sys.refresh_all();

        let hostname = System::host_name().unwrap_or_else(|| "unknown".to_string());
        let os_name = System::name().unwrap_or_else(|| "unknown".to_string());
        let os_version = System::os_version().unwrap_or_else(|| "unknown".to_string());
        let kernel_version = System::kernel_version().unwrap_or_else(|| "unknown".to_string());

        // CPU info
        let cpu_count = sys.cpus().len();
        let cpu_name = sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // Memory info
        let total_memory = sys.total_memory();
        let used_memory = sys.used_memory();
        let available_memory = sys.available_memory();

        // Disk info
        let mut disk_info = Vec::new();
        for disk in sysinfo::Disks::new_with_refreshed_list().iter() {
            let name = disk.name().to_string_lossy().to_string();
            let mount = disk.mount_point().to_string_lossy().to_string();
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total - available;
            disk_info.push(format!(
                "  {} ({}): {} used of {} ({} available)",
                mount,
                name,
                format_bytes(used),
                format_bytes(total),
                format_bytes(available)
            ));
        }

        let info = format!(
            "=== System Information ===\n\n\
            Hostname: {}\n\
            OS: {} {}\n\
            Kernel: {}\n\n\
            === CPU ===\n\
            Processor: {}\n\
            Cores: {}\n\n\
            === Memory ===\n\
            Total: {}\n\
            Used: {}\n\
            Available: {}\n\n\
            === Disks ===\n{}",
            hostname,
            os_name,
            os_version,
            kernel_version,
            cpu_name,
            cpu_count,
            format_bytes(total_memory),
            format_bytes(used_memory),
            format_bytes(available_memory),
            disk_info.join("\n")
        );

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

        // Try Tavily first
        if let Some(api_key) = &self.tavily_api_key {
            if !api_key.is_empty() {
                match search_tavily(&query, api_key).await {
                    Ok(results) => {
                        if results.is_empty() {
                            return Ok(CallToolResult::success(vec![Content::text(format!(
                                "No search results found for '{}'",
                                query
                            ))]));
                        }

                        let formatted: Vec<String> = results
                            .iter()
                            .enumerate()
                            .map(|(i, r)| {
                                format!(
                                    "{}. {}\n   URL: {}\n   {}",
                                    i + 1,
                                    r.title,
                                    r.url,
                                    r.snippet
                                )
                            })
                            .collect();

                        return Ok(CallToolResult::success(vec![Content::text(format!(
                            "Search results for '{}':\n\n{}",
                            query,
                            formatted.join("\n\n")
                        ))]));
                    }
                    Err(e) => {
                        eprintln!("Tavily search failed: {}", e);
                        // Fall through to try SearXNG
                    }
                }
            }
        }

        // Try SearXNG
        if let Some(url) = &self.searxng_url {
            if !url.is_empty() {
                match search_searxng(&query, url).await {
                    Ok(results) => {
                        if results.is_empty() {
                            return Ok(CallToolResult::success(vec![Content::text(format!(
                                "No search results found for '{}'",
                                query
                            ))]));
                        }

                        let formatted: Vec<String> = results
                            .iter()
                            .enumerate()
                            .map(|(i, r)| {
                                format!(
                                    "{}. {}\n   URL: {}\n   {}",
                                    i + 1,
                                    r.title,
                                    r.url,
                                    r.snippet
                                )
                            })
                            .collect();

                        return Ok(CallToolResult::success(vec![Content::text(format!(
                            "Search results for '{}':\n\n{}",
                            query,
                            formatted.join("\n\n")
                        ))]));
                    }
                    Err(e) => {
                        return Ok(CallToolResult::error(vec![Content::text(format!(
                            "Search failed: {}",
                            e
                        ))]));
                    }
                }
            }
        }

        Ok(CallToolResult::error(vec![Content::text(
            "No search provider configured. Set up Tavily API key or SearXNG URL in settings.",
        )]))
    }

    /// List portable programs
    #[tool(description = "List all portable programs available in the data/programs folder.")]
    pub async fn list_programs(&self) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP list_programs");

        match list_programs_in_folder() {
            Ok(programs) => {
                if programs.is_empty() {
                    return Ok(CallToolResult::success(vec![Content::text(
                        "No programs found in data/programs folder.",
                    )]));
                }

                let formatted: Vec<String> = programs
                    .iter()
                    .map(|p| {
                        let exes = if p.executables.is_empty() {
                            "No executables found".to_string()
                        } else {
                            p.executables.join(", ")
                        };
                        format!("- {}\n  Path: {}\n  Executables: {}", p.name, p.path, exes)
                    })
                    .collect();

                Ok(CallToolResult::success(vec![Content::text(format!(
                    "Available programs ({}):\n\n{}",
                    programs.len(),
                    formatted.join("\n\n")
                ))]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error listing programs: {}",
                e
            ))])),
        }
    }

    /// Find an executable by name or keyword across portable programs and optionally system PATH
    #[tool(
        description = "Find a specific executable by name/keyword in data/programs (searched recursively). Use this instead of list_programs when you know what tool you're looking for — much more token-efficient. Returns full absolute paths of matches. Set search_path=true to also check system PATH via where.exe."
    )]
    pub async fn find_exe(
        &self,
        #[tool(param)] query: String,
        #[tool(param)] search_path: Option<bool>,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP find_exe: {} search_path={:?}", query, search_path);

        let programs_dir = get_data_dir().join("programs");
        let query_lower = query.to_lowercase();
        let mut matches: Vec<String> = Vec::new();

        fn walk_for_exe(dir: &Path, query: &str, results: &mut Vec<String>) {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        walk_for_exe(&p, query, results);
                    } else if p.extension().map(|e| e == "exe").unwrap_or(false) {
                        let stem = p
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        if stem.contains(query) {
                            results.push(p.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        if programs_dir.exists() {
            walk_for_exe(&programs_dir, &query_lower, &mut matches);
        }

        if search_path.unwrap_or(false) {
            if let Ok(output) = Command::new("cmd")
                .args(["/C", &format!("where.exe {}", query)])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let t = line.trim().to_string();
                    if !t.is_empty() {
                        matches.push(t);
                    }
                }
            }
        }

        if matches.is_empty() {
            Ok(CallToolResult::success(vec![Content::text(format!(
                "No executable matching '{}' found in data/programs{}.",
                query,
                if search_path.unwrap_or(false) {
                    " or system PATH"
                } else {
                    ""
                }
            ))]))
        } else {
            Ok(CallToolResult::success(vec![Content::text(
                matches.join("\n"),
            )]))
        }
    }

    /// List custom instruments
    #[tool(description = "List available custom instruments (scripts) that can be run.")]
    pub async fn list_instruments(&self) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP list_instruments");

        match list_instruments_in_folder() {
            Ok(instruments) => {
                if instruments.is_empty() {
                    return Ok(CallToolResult::success(vec![Content::text(
                        "No instruments found in data/instruments folder.",
                    )]));
                }

                let formatted: Vec<String> = instruments
                    .iter()
                    .map(|i| {
                        format!(
                            "- {} ({})\n  Path: {}\n  {}",
                            i.name, i.extension, i.path, i.description
                        )
                    })
                    .collect();

                Ok(CallToolResult::success(vec![Content::text(format!(
                    "Available instruments ({}):\n\n{}",
                    instruments.len(),
                    formatted.join("\n\n")
                ))]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error listing instruments: {}",
                e
            ))])),
        }
    }

    /// Run a custom instrument
    #[tool(description = "Run a custom instrument (script) by name.")]
    pub async fn run_instrument(
        &self,
        #[tool(param)] name: String,
        #[tool(param)] args: Option<String>,
    ) -> Result<CallToolResult, rmcp::Error> {
        eprintln!("MCP run_instrument: {} args={:?}", name, args);

        // Find the instrument
        let instruments = match list_instruments_in_folder() {
            Ok(list) => list,
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Error finding instruments: {}",
                    e
                ))]));
            }
        };

        let instrument = instruments
            .iter()
            .find(|i| i.name.to_lowercase() == name.to_lowercase());

        let instrument = match instrument {
            Some(i) => i,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Instrument '{}' not found. Use list_instruments to see available options.",
                    name
                ))]));
            }
        };

        // Construct command based on extension
        let args_str = args.unwrap_or_default();
        let command = match instrument.extension.as_str() {
            "ps1" => format!(
                "powershell -ExecutionPolicy Bypass -File \"{}\" {}",
                instrument.path, args_str
            ),
            "bat" | "cmd" => format!("\"{}\" {}", instrument.path, args_str),
            "exe" => format!("\"{}\" {}", instrument.path, args_str),
            "py" => format!("python \"{}\" {}", instrument.path, args_str),
            "js" => format!("node \"{}\" {}", instrument.path, args_str),
            _ => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Unsupported instrument extension: {}",
                    instrument.extension
                ))]));
            }
        };

        // Execute the instrument
        match execute_shell_command(&command) {
            Ok(result) => {
                let output = if result.exit_code == 0 {
                    format!(
                        "Instrument '{}' completed successfully.\n\nOutput:\n{}",
                        name, result.stdout
                    )
                } else {
                    format!(
                        "Instrument '{}' failed (exit code {}).\n\nStdout:\n{}\n\nStderr:\n{}",
                        name, result.exit_code, result.stdout, result.stderr
                    )
                };
                Ok(CallToolResult::success(vec![Content::text(output)]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error running instrument '{}': {}",
                name, e
            ))])),
        }
    }
}

// =============================================================================
// Search Implementation
// =============================================================================

struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

async fn search_tavily(query: &str, api_key: &str) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::new();

    let response = client
        .post("https://api.tavily.com/search")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "api_key": api_key,
            "query": query,
            "search_depth": "basic",
            "max_results": 5
        }))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Tavily API error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let results = data["results"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|r| SearchResult {
                    title: r["title"].as_str().unwrap_or("").to_string(),
                    url: r["url"].as_str().unwrap_or("").to_string(),
                    snippet: r["content"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(results)
}

async fn search_searxng(query: &str, instance_url: &str) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::new();
    let encoded_query = urlencoding::encode(query);
    let url = format!(
        "{}/search?q={}&format=json&categories=general",
        instance_url.trim_end_matches('/'),
        encoded_query
    );

    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("SearXNG API error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let results = data["results"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .take(5)
                .map(|r| SearchResult {
                    title: r["title"].as_str().unwrap_or("").to_string(),
                    url: r["url"].as_str().unwrap_or("").to_string(),
                    snippet: r["content"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(results)
}
