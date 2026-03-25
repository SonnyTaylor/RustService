//! File operations, instruments, programs

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use regex::Regex;

use super::{get_data_dir_path, FileEntry, Instrument};

/// Canonicalizes a path and blocks access to critical Windows system directories.
///
/// For new files (not yet on disk), canonicalizes the parent and re-appends the
/// filename so that `../` tricks are resolved before the path is used.
fn validate_agent_path(path: &std::path::Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().or_else(|_| {
        if let Some(parent) = path.parent() {
            let canonical_parent = parent
                .canonicalize()
                .map_err(|e| format!("Invalid path: {}", e))?;
            Ok(canonical_parent
                .join(path.file_name().ok_or("Invalid filename")?))
        } else {
            Err(format!("Invalid path: {}", path.display()))
        }
    })?;

    // canonicalize() on Windows resolves 8.3 short names (e.g. PROGRA~1 -> Program Files)
    let path_str = canonical.to_string_lossy().to_lowercase();

    // Secondary defense: blocklist of critical system directories
    let blocked = [
        "\\windows\\system32",
        "\\windows\\syswow64",
        "\\windows\\winsxs",
        "\\program files\\windowsapps",
    ];

    for blocked_path in &blocked {
        if path_str.contains(blocked_path) {
            return Err(format!(
                "Access denied: cannot modify files in {}",
                blocked_path
            ));
        }
    }

    // Primary defense: allowlist — path must be under an allowed directory
    let data_dir = get_data_dir_path()
        .canonicalize()
        .unwrap_or_else(|_| get_data_dir_path());
    let cwd = std::env::current_dir()
        .ok()
        .and_then(|p| p.canonicalize().ok());
    let home_dir = dirs::home_dir().and_then(|p| p.canonicalize().ok());

    let allowed_dirs: Vec<PathBuf> = [Some(data_dir), cwd, home_dir]
        .into_iter()
        .flatten()
        .collect();

    let is_allowed = allowed_dirs
        .iter()
        .any(|allowed| canonical.starts_with(allowed));

    if !is_allowed {
        return Err(format!(
            "Access denied: path '{}' is outside allowed directories",
            canonical.display()
        ));
    }

    Ok(canonical)
}

/// Read file with optional line numbers and pagination
#[tauri::command(rename_all = "snake_case")]
pub fn agent_read_file(
    path: String,
    offset: Option<usize>,
    limit: Option<usize>,
    line_numbers: Option<bool>,
) -> Result<serde_json::Value, String> {
    let safe_path = validate_agent_path(std::path::Path::new(&path))?;
    let content =
        fs::read_to_string(&safe_path).map_err(|e| format!("Failed to read file: {}", e))?;

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
    let formatted_content = if show_line_numbers {
        selected
            .iter()
            .enumerate()
            .map(|(idx, line)| format!("{:4}| {}", offset_val + idx + 1, line))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        selected.join("\n")
    };

    Ok(serde_json::json!({
        "content": formatted_content,
        "total_lines": total_lines,
        "has_more": end < total_lines,
    }))
}

/// Write to a file (requires approval in non-YOLO mode)
/// Creates parent directories if they don't exist
#[tauri::command]
pub fn agent_write_file(path: String, content: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);

    // Validate path BEFORE creating any directories
    let safe_path = validate_agent_path(&path_buf)?;

    // Create parent directories if they don't exist
    if let Some(parent) = safe_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }

    fs::write(&safe_path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn agent_list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let safe_path = validate_agent_path(std::path::Path::new(&path))?;
    let mut entries = Vec::new();
    for entry in fs::read_dir(&safe_path).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to get metadata: {}", e))?;

        entries.push(FileEntry {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
            size: metadata.len(),
        });
    }
    Ok(entries)
}

#[tauri::command]
pub fn agent_move_file(src: String, dest: String) -> Result<(), String> {
    let safe_src = validate_agent_path(std::path::Path::new(&src))?;
    let safe_dest = validate_agent_path(std::path::Path::new(&dest))?;
    fs::rename(&safe_src, &safe_dest).map_err(|e| format!("Failed to move file: {}", e))
}

#[tauri::command]
pub fn agent_copy_file(src: String, dest: String) -> Result<(), String> {
    let safe_src = validate_agent_path(std::path::Path::new(&src))?;
    let safe_dest = validate_agent_path(std::path::Path::new(&dest))?;
    fs::copy(&safe_src, &safe_dest)
        .map(|_| ())
        .map_err(|e| format!("Failed to copy file: {}", e))
}

/// List instruments (custom scripts)
#[tauri::command]
pub fn list_instruments() -> Result<Vec<Instrument>, String> {
    let instruments_dir = get_data_dir_path().join("instruments");
    if !instruments_dir.exists() {
        // Create if it doesn't exist
        fs::create_dir_all(&instruments_dir)
            .map_err(|e| format!("Failed to create instruments directory: {}", e))?;
        return Ok(vec![]);
    }

    let mut instruments = Vec::new();
    if let Ok(entries) = fs::read_dir(instruments_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ["ps1", "bat", "cmd", "exe", "py", "js"].contains(&ext) {
                        let name = path
                            .file_stem()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        instruments.push(Instrument {
                            name,
                            description: format!("Custom instrument ({})", ext),
                            path: path.to_string_lossy().to_string(),
                            extension: ext.to_string(),
                        });
                    }
                }
            }
        }
    }
    Ok(instruments)
}

fn collect_exes_recursive(dir: &std::path::Path, root: &std::path::Path, acc: &mut Vec<String>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                collect_exes_recursive(&p, root, acc);
            } else if p.extension().map(|e| e == "exe").unwrap_or(false) {
                if let Ok(rel) = p.strip_prefix(root) {
                    acc.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
}

/// List programs in the programs folder
#[tauri::command]
pub fn list_agent_programs() -> Result<Vec<HashMap<String, String>>, String> {
    let programs_dir = get_data_dir_path().join("programs");

    if !programs_dir.exists() {
        return Ok(vec![]);
    }

    let mut programs = Vec::new();

    for entry in
        fs::read_dir(&programs_dir).map_err(|e| format!("Failed to read programs dir: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let mut exes = Vec::new();
            collect_exes_recursive(&path, &path, &mut exes);

            let mut info = HashMap::new();
            info.insert("name".to_string(), name);
            info.insert("path".to_string(), path.to_string_lossy().to_string());
            info.insert("executables".to_string(), exes.join(", "));

            programs.push(info);
        }
    }

    Ok(programs)
}

/// Find executables by name/keyword across the programs folder and optionally system PATH
#[tauri::command]
pub fn agent_find_exe(query: String, search_path: Option<bool>) -> Result<Vec<String>, String> {
    let programs_dir = get_data_dir_path().join("programs");
    let query_lower = query.to_lowercase();
    let mut matches: Vec<String> = Vec::new();

    fn walk(dir: &std::path::Path, query: &str, results: &mut Vec<String>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    walk(&p, query, results);
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
        walk(&programs_dir, &query_lower, &mut matches);
    }

    if search_path.unwrap_or(false) {
        if let Ok(output) = std::process::Command::new("where.exe")
            .arg(&query)
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

    Ok(matches)
}

/// Edit file by replacing old_string with new_string
#[tauri::command(rename_all = "snake_case")]
pub fn agent_edit_file(
    path: String,
    old_string: String,
    new_string: String,
    all: Option<bool>,
) -> Result<serde_json::Value, String> {
    let text = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let replace_all = all.unwrap_or(false);

    if !text.contains(&old_string) {
        return Ok(serde_json::json!({
            "status": "error",
            "replacements": 0,
            "message": "old_string not found in file",
        }));
    }

    let count = text.matches(&old_string).count();
    if !replace_all && count > 1 {
        return Ok(serde_json::json!({
            "status": "error",
            "replacements": 0,
            "message": format!("old_string appears {} times, must be unique (use all=true)", count),
        }));
    }

    let replacement = if replace_all {
        text.replace(&old_string, &new_string)
    } else {
        text.replacen(&old_string, &new_string, 1)
    };

    fs::write(&path, replacement).map_err(|e| format!("Failed to write file: {}", e))?;

    let replacements = if replace_all { count } else { 1 };

    Ok(serde_json::json!({
        "status": "success",
        "replacements": replacements,
        "message": format!("Successfully made {} replacement{}", replacements, if replacements > 1 { "s" } else { "" }),
    }))
}

/// Grep - search for regex pattern across files
#[tauri::command(rename_all = "snake_case")]
pub fn agent_grep(
    pattern: String,
    path: Option<String>,
    file_pattern: Option<String>,
    max_results: Option<usize>,
) -> Result<Vec<serde_json::Value>, String> {
    let regex = Regex::new(&pattern).map_err(|e| format!("Invalid regex pattern: {}", e))?;

    let base_path = path.unwrap_or_else(|| ".".to_string());
    let base_path_buf = PathBuf::from(&base_path);
    validate_agent_path(&base_path_buf)?;

    let max = max_results.unwrap_or(50);
    let glob_pat = file_pattern.unwrap_or_else(|| "*".to_string());

    let mut results = Vec::new();

    // Build glob pattern
    let full_pattern = format!("{}/**/{}", base_path, glob_pat);

    for entry in glob::glob(&full_pattern)
        .map_err(|e| format!("Invalid glob pattern: {}", e))?
        .flatten()
    {
        if !entry.is_file() {
            continue;
        }

        // Try to read as text
        if let Ok(content) = fs::read_to_string(&entry) {
            for (line_num, line) in content.lines().enumerate() {
                if regex.is_match(line) {
                    results.push(serde_json::json!({
                        "file": entry.to_string_lossy().to_string(),
                        "line": line_num + 1,
                        "content": line.to_string(),
                    }));

                    if results.len() >= max {
                        return Ok(results);
                    }
                }
            }
        }
    }

    Ok(results)
}

/// Glob - find files matching pattern, sorted by mtime
#[tauri::command(rename_all = "snake_case")]
pub fn agent_glob(
    pattern: String,
    path: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<serde_json::Value>, String> {
    let base_path = path.unwrap_or_else(|| ".".to_string());
    let base_path_buf = PathBuf::from(&base_path);
    validate_agent_path(&base_path_buf)?;

    let max = limit.unwrap_or(100);

    let full_pattern = format!("{}/{}", base_path, pattern);

    let mut files: Vec<(std::path::PathBuf, std::time::SystemTime, u64)> = Vec::new();

    for entry in glob::glob(&full_pattern)
        .map_err(|e| format!("Invalid glob pattern: {}", e))?
        .flatten()
    {
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

    let results: Vec<serde_json::Value> = files
        .into_iter()
        .take(max)
        .map(|(path, mtime, size)| {
            let modified_str = chrono::DateTime::<chrono::Local>::from(mtime)
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();

            serde_json::json!({
                "path": path.to_string_lossy().to_string(),
                "name": path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                "modified": modified_str,
                "size": size,
            })
        })
        .collect();

    Ok(results)
}
