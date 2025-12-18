//! Agent commands
//!
//! Tauri commands for the agentic AI system including command execution,
//! memory management, and search functionality.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

use chrono::Utc;
use regex::Regex;
use rusqlite::{params, Connection};
use serde_json::json;
use uuid::Uuid;

use super::data_dir::get_data_dir_path;
use super::settings::get_settings;
use crate::types::{
    AgentSettings, ApprovalMode, CommandExecutionResult, CommandStatus, Memory, MemoryType,
    PendingCommand, SearchResult,
};

#[derive(serde::Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(serde::Serialize)]
pub struct Instrument {
    pub name: String,
    pub description: String,
    pub path: String,
    pub extension: String,
}

// =============================================================================
// Global State
// =============================================================================

/// Pending commands awaiting approval
static PENDING_COMMANDS: Mutex<Vec<PendingCommand>> = Mutex::new(Vec::new());

// =============================================================================
// Database Helpers
// =============================================================================

fn get_agent_dir() -> PathBuf {
    get_data_dir_path().join("agent")
}

fn get_memory_db_path() -> PathBuf {
    get_agent_dir().join("memory.db")
}

fn ensure_agent_dir() -> Result<(), String> {
    let dir = get_agent_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create agent directory: {}", e))?;
    Ok(())
}

fn get_db_connection() -> Result<Connection, String> {
    ensure_agent_dir()?;
    let path = get_memory_db_path();
    let conn =
        Connection::open(&path).map_err(|e| format!("Failed to open memory database: {}", e))?;

    // Initialize tables if they don't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding BLOB,
            metadata TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create memories table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS command_history (
            id TEXT PRIMARY KEY,
            command TEXT NOT NULL,
            reason TEXT,
            status TEXT NOT NULL,
            output TEXT,
            error TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create command_history table: {}", e))?;

    // Create index for faster text search
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)",
        [],
    )
    .map_err(|e| format!("Failed to create index: {}", e))?;

    Ok(conn)
}

// =============================================================================
// Command Execution
// =============================================================================

/// Check if a command matches the whitelist patterns
fn is_command_whitelisted(command: &str, patterns: &[String]) -> bool {
    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if re.is_match(command) {
                return true;
            }
        }
    }
    false
}

/// Execute a shell command
fn execute_shell_command(command: &str) -> Result<CommandExecutionResult, String> {
    #[cfg(windows)]
    {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", command])
            .output()
            .map_err(|e| format!("Failed to execute command: {}", e))?;

        Ok(CommandExecutionResult {
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

        Ok(CommandExecutionResult {
            exit_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}

/// Execute a command directly (bypasses approval mode check)
/// Used by the frontend HITL flow after user has already approved
#[tauri::command]
pub fn execute_agent_command(command: String, reason: String) -> Result<PendingCommand, String> {
    let result = execute_shell_command(&command)?;

    let pending = PendingCommand {
        id: Uuid::new_v4().to_string(),
        command,
        reason,
        created_at: Utc::now().to_rfc3339(),
        status: if result.exit_code == 0 {
            CommandStatus::Executed
        } else {
            CommandStatus::Failed
        },
        output: Some(result.stdout),
        error: if result.stderr.is_empty() {
            None
        } else {
            Some(result.stderr)
        },
    };

    // Log to history
    log_command_to_history(&pending)?;

    Ok(pending)
}

/// Queue a command for approval
#[tauri::command]
pub fn queue_agent_command(command: String, reason: String) -> Result<PendingCommand, String> {
    let settings = get_settings()?;
    let agent_settings = &settings.agent;

    // Check approval mode
    match agent_settings.approval_mode {
        ApprovalMode::Yolo => {
            // Execute immediately
            let result = execute_shell_command(&command)?;
            let pending = PendingCommand {
                id: Uuid::new_v4().to_string(),
                command,
                reason,
                created_at: Utc::now().to_rfc3339(),
                status: if result.exit_code == 0 {
                    CommandStatus::Executed
                } else {
                    CommandStatus::Failed
                },
                output: Some(result.stdout),
                error: if result.stderr.is_empty() {
                    None
                } else {
                    Some(result.stderr)
                },
            };

            // Log to history
            log_command_to_history(&pending)?;

            Ok(pending)
        }
        ApprovalMode::Whitelist => {
            if is_command_whitelisted(&command, &agent_settings.whitelisted_commands) {
                // Execute immediately
                let result = execute_shell_command(&command)?;
                let pending = PendingCommand {
                    id: Uuid::new_v4().to_string(),
                    command,
                    reason,
                    created_at: Utc::now().to_rfc3339(),
                    status: if result.exit_code == 0 {
                        CommandStatus::Executed
                    } else {
                        CommandStatus::Failed
                    },
                    output: Some(result.stdout),
                    error: if result.stderr.is_empty() {
                        None
                    } else {
                        Some(result.stderr)
                    },
                };

                log_command_to_history(&pending)?;
                Ok(pending)
            } else {
                // Queue for approval
                queue_for_approval(command, reason)
            }
        }
        ApprovalMode::Always => {
            // Always queue for approval
            queue_for_approval(command, reason)
        }
    }
}

fn queue_for_approval(command: String, reason: String) -> Result<PendingCommand, String> {
    let pending = PendingCommand {
        id: Uuid::new_v4().to_string(),
        command,
        reason,
        created_at: Utc::now().to_rfc3339(),
        status: CommandStatus::Pending,
        output: None,
        error: None,
    };

    let mut commands = PENDING_COMMANDS
        .lock()
        .map_err(|e| format!("Failed to lock pending commands: {}", e))?;
    commands.push(pending.clone());

    Ok(pending)
}

fn log_command_to_history(cmd: &PendingCommand) -> Result<(), String> {
    let conn = get_db_connection()?;

    let status_str = match cmd.status {
        CommandStatus::Pending => "pending",
        CommandStatus::Approved => "approved",
        CommandStatus::Rejected => "rejected",
        CommandStatus::Executed => "executed",
        CommandStatus::Failed => "failed",
    };

    conn.execute(
        "INSERT INTO command_history (id, command, reason, status, output, error, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            cmd.id,
            cmd.command,
            cmd.reason,
            status_str,
            cmd.output,
            cmd.error,
            cmd.created_at
        ],
    )
    .map_err(|e| format!("Failed to log command: {}", e))?;

    Ok(())
}

/// Get all pending commands
#[tauri::command]
pub fn get_pending_commands() -> Result<Vec<PendingCommand>, String> {
    let commands = PENDING_COMMANDS
        .lock()
        .map_err(|e| format!("Failed to lock pending commands: {}", e))?;
    Ok(commands.clone())
}

/// Clear all pending commands
#[tauri::command]
pub fn clear_pending_commands() -> Result<(), String> {
    let mut commands = PENDING_COMMANDS
        .lock()
        .map_err(|e| format!("Failed to lock pending commands: {}", e))?;
    commands.clear();
    Ok(())
}

/// Approve a pending command and execute it
#[tauri::command(rename_all = "snake_case")]
pub fn approve_command(command_id: String) -> Result<PendingCommand, String> {
    let mut commands = PENDING_COMMANDS
        .lock()
        .map_err(|e| format!("Failed to lock pending commands: {}", e))?;

    let idx = commands
        .iter()
        .position(|c| c.id == command_id)
        .ok_or_else(|| "Command not found".to_string())?;

    let mut cmd = commands.remove(idx);

    // Execute the command
    let result = execute_shell_command(&cmd.command)?;

    cmd.status = if result.exit_code == 0 {
        CommandStatus::Executed
    } else {
        CommandStatus::Failed
    };
    cmd.output = Some(result.stdout);
    cmd.error = if result.stderr.is_empty() {
        None
    } else {
        Some(result.stderr)
    };

    // Log to history
    log_command_to_history(&cmd)?;

    Ok(cmd)
}

/// Reject a pending command
#[tauri::command(rename_all = "snake_case")]
pub fn reject_command(command_id: String) -> Result<PendingCommand, String> {
    let mut commands = PENDING_COMMANDS
        .lock()
        .map_err(|e| format!("Failed to lock pending commands: {}", e))?;

    let idx = commands
        .iter()
        .position(|c| c.id == command_id)
        .ok_or_else(|| "Command not found".to_string())?;

    let mut cmd = commands.remove(idx);
    cmd.status = CommandStatus::Rejected;

    // Log to history
    log_command_to_history(&cmd)?;

    Ok(cmd)
}

// =============================================================================
// Memory Operations
// =============================================================================

/// Save a memory entry
#[tauri::command]
pub fn save_memory(
    memory_type: String,
    content: String,
    metadata: Option<serde_json::Value>,
    embedding: Option<Vec<f32>>,
) -> Result<Memory, String> {
    let conn = get_db_connection()?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // Clone metadata for later use
    let metadata_for_return = metadata.clone().unwrap_or(json!({}));

    let meta_str = metadata
        .map(|m| serde_json::to_string(&m).unwrap_or_default())
        .unwrap_or_else(|| "{}".to_string());

    // Convert embedding to bytes if provided
    let embedding_bytes: Option<Vec<u8>> =
        embedding.map(|e| e.iter().flat_map(|f| f.to_le_bytes().to_vec()).collect());

    conn.execute(
        "INSERT INTO memories (id, type, content, embedding, metadata, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id,
            memory_type,
            content,
            embedding_bytes,
            meta_str,
            now,
            now
        ],
    )
    .map_err(|e| format!("Failed to save memory: {}", e))?;

    let mem_type = match memory_type.as_str() {
        "fact" => MemoryType::Fact,
        "solution" => MemoryType::Solution,
        "conversation" => MemoryType::Conversation,
        "instruction" => MemoryType::Instruction,
        "behavior" => MemoryType::Behavior,
        _ => MemoryType::Fact,
    };

    Ok(Memory {
        id,
        memory_type: mem_type,
        content,
        metadata: metadata_for_return,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Helper to convert row data to Memory
fn row_to_memory(
    id: String,
    type_str: String,
    content: String,
    meta_str: String,
    created_at: String,
    updated_at: String,
) -> Memory {
    let mem_type = match type_str.as_str() {
        "fact" => MemoryType::Fact,
        "solution" => MemoryType::Solution,
        "conversation" => MemoryType::Conversation,
        "instruction" => MemoryType::Instruction,
        "behavior" => MemoryType::Behavior,
        _ => MemoryType::Fact,
    };

    let metadata: serde_json::Value = serde_json::from_str(&meta_str).unwrap_or(json!({}));

    Memory {
        id,
        memory_type: mem_type,
        content,
        metadata,
        created_at,
        updated_at,
    }
}

/// Search memories by text (simple substring search)
#[tauri::command]
pub fn search_memories(
    query: String,
    memory_type: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Memory>, String> {
    let conn = get_db_connection()?;

    let limit_val = limit.unwrap_or(10) as i64;
    let search_pattern = format!("%{}%", query.to_lowercase());

    let mut memories = Vec::new();

    if let Some(mem_type) = memory_type {
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at 
                 FROM memories 
                 WHERE LOWER(content) LIKE ?1 AND type = ?2
                 ORDER BY updated_at DESC
                 LIMIT ?3",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![search_pattern, mem_type, limit_val], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (id, type_str, content, meta_str, created_at, updated_at) =
                row.map_err(|e| format!("Failed to read row: {}", e))?;
            memories.push(row_to_memory(
                id, type_str, content, meta_str, created_at, updated_at,
            ));
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at 
                 FROM memories 
                 WHERE LOWER(content) LIKE ?1
                 ORDER BY updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![search_pattern, limit_val], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (id, type_str, content, meta_str, created_at, updated_at) =
                row.map_err(|e| format!("Failed to read row: {}", e))?;
            memories.push(row_to_memory(
                id, type_str, content, meta_str, created_at, updated_at,
            ));
        }
    }

    Ok(memories)
}

/// Get all memories
#[tauri::command]
pub fn get_all_memories(
    memory_type: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Memory>, String> {
    let conn = get_db_connection()?;
    let limit_val = limit.unwrap_or(100) as i64;

    let mut memories = Vec::new();

    if let Some(mem_type) = memory_type {
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at 
                 FROM memories 
                 WHERE type = ?1
                 ORDER BY updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![mem_type, limit_val], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (id, type_str, content, meta_str, created_at, updated_at) =
                row.map_err(|e| format!("Failed to read row: {}", e))?;
            memories.push(row_to_memory(
                id, type_str, content, meta_str, created_at, updated_at,
            ));
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at 
                 FROM memories 
                 ORDER BY updated_at DESC
                 LIMIT ?1",
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![limit_val], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (id, type_str, content, meta_str, created_at, updated_at) =
                row.map_err(|e| format!("Failed to read row: {}", e))?;
            memories.push(row_to_memory(
                id, type_str, content, meta_str, created_at, updated_at,
            ));
        }
    }

    Ok(memories)
}

/// Delete a memory entry
#[tauri::command]
pub fn delete_memory(memory_id: String) -> Result<(), String> {
    let conn = get_db_connection()?;

    conn.execute("DELETE FROM memories WHERE id = ?1", params![memory_id])
        .map_err(|e| format!("Failed to delete memory: {}", e))?;

    Ok(())
}

/// Clear all memories
#[tauri::command]
pub fn clear_all_memories() -> Result<(), String> {
    let conn = get_db_connection()?;

    conn.execute("DELETE FROM memories", [])
        .map_err(|e| format!("Failed to clear memories: {}", e))?;

    Ok(())
}

// =============================================================================
// Vector Search
// =============================================================================

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot_product: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot_product / (norm_a * norm_b)
    }
}

/// Search memories using vector similarity
#[tauri::command]
pub fn search_memories_vector(
    embedding: Vec<f32>,
    limit: Option<usize>,
) -> Result<Vec<Memory>, String> {
    let conn = get_db_connection()?;
    let limit_val = limit.unwrap_or(5);

    // Fetch all memories with embeddings
    let mut stmt = conn
        .prepare(
            "SELECT id, type, content, metadata, created_at, updated_at, embedding 
             FROM memories 
             WHERE embedding IS NOT NULL",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Vec<u8>>(6)?,
            ))
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    let mut scored_memories = Vec::new();

    for row in rows {
        let (id, type_str, content, meta_str, created_at, updated_at, embedding_bytes) =
            row.map_err(|e| format!("Failed to read row: {}", e))?;

        // Convert bytes back to Vec<f32>
        let stored_embedding: Vec<f32> = embedding_bytes
            .chunks(4)
            .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap()))
            .collect();

        if stored_embedding.len() == embedding.len() {
            let score = cosine_similarity(&embedding, &stored_embedding);
            scored_memories.push((
                score,
                row_to_memory(id, type_str, content, meta_str, created_at, updated_at),
            ));
        }
    }

    // Sort by score descending
    scored_memories.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    // Return top K
    Ok(scored_memories
        .into_iter()
        .take(limit_val)
        .map(|(_, m)| m)
        .collect())
}

// =============================================================================
// Search Operations
// =============================================================================

/// Search the web using Tavily
#[tauri::command]
pub async fn search_tavily(query: String, api_key: String) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::new();

    let response = client
        .post("https://api.tavily.com/search")
        .header("Content-Type", "application/json")
        .json(&json!({
            "api_key": api_key,
            "query": query,
            "search_depth": "basic",
            "include_answer": false,
            "include_images": false,
            "max_results": 5
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Tavily API error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let results = data["results"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|r| SearchResult {
            title: r["title"].as_str().unwrap_or("").to_string(),
            url: r["url"].as_str().unwrap_or("").to_string(),
            snippet: r["content"].as_str().unwrap_or("").to_string(),
            score: r["score"].as_f64(),
        })
        .collect();

    Ok(results)
}

/// Search the web using SearXNG
#[tauri::command]
pub async fn search_searxng(
    query: String,
    instance_url: String,
) -> Result<Vec<SearchResult>, String> {
    let client = reqwest::Client::new();

    let url = format!(
        "{}/search?q={}&format=json",
        instance_url.trim_end_matches('/'),
        urlencoding::encode(&query)
    );

    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("SearXNG error: {}", response.status()));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let results = data["results"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .take(5)
        .map(|r| SearchResult {
            title: r["title"].as_str().unwrap_or("").to_string(),
            url: r["url"].as_str().unwrap_or("").to_string(),
            snippet: r["content"].as_str().unwrap_or("").to_string(),
            score: r["score"].as_f64(),
        })
        .collect();

    Ok(results)
}

// =============================================================================
// Agent Settings
// =============================================================================

/// Get agent settings
#[tauri::command]
pub fn get_agent_settings() -> Result<AgentSettings, String> {
    let settings = get_settings()?;
    Ok(settings.agent)
}

/// Get command history
#[tauri::command]
pub fn get_command_history(limit: Option<usize>) -> Result<Vec<PendingCommand>, String> {
    let conn = get_db_connection()?;
    let limit = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, command, reason, status, output, error, created_at 
             FROM command_history 
             ORDER BY created_at DESC
             LIMIT ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map(params![limit as i64], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    let mut history = Vec::new();
    for row in rows {
        let (id, command, reason, status_str, output, error, created_at) =
            row.map_err(|e| format!("Failed to read row: {}", e))?;

        let status = match status_str.as_str() {
            "pending" => CommandStatus::Pending,
            "approved" => CommandStatus::Approved,
            "rejected" => CommandStatus::Rejected,
            "executed" => CommandStatus::Executed,
            "failed" => CommandStatus::Failed,
            _ => CommandStatus::Pending,
        };

        history.push(PendingCommand {
            id,
            command,
            reason: reason.unwrap_or_default(),
            created_at,
            status,
            output,
            error,
        });
    }

    Ok(history)
}

// =============================================================================
// File Operations
// =============================================================================

/// Read a file's contents
/// Read a file's contents
#[tauri::command]
pub fn agent_read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Write to a file (requires approval in non-YOLO mode)
#[tauri::command]
pub fn agent_write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn agent_list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| format!("Failed to read dir: {}", e))? {
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
    fs::rename(src, dest).map_err(|e| format!("Failed to move file: {}", e))
}

#[tauri::command]
pub fn agent_copy_file(src: String, dest: String) -> Result<(), String> {
    fs::copy(src, dest)
        .map(|_| ())
        .map_err(|e| format!("Failed to copy file: {}", e))
}

/// List instruments (custom scripts)
#[tauri::command]
pub fn list_instruments() -> Result<Vec<Instrument>, String> {
    let instruments_dir = get_data_dir_path().join("instruments");
    if !instruments_dir.exists() {
        // Create if it doesn't exist
        fs::create_dir_all(&instruments_dir).ok();
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

            // Look for executable files
            let mut exes = Vec::new();
            if let Ok(entries) = fs::read_dir(&path) {
                for exe_entry in entries.flatten() {
                    let exe_path = exe_entry.path();
                    if exe_path.extension().map(|e| e == "exe").unwrap_or(false) {
                        if let Some(exe_name) = exe_path.file_name().and_then(|n| n.to_str()) {
                            exes.push(exe_name.to_string());
                        }
                    }
                }
            }

            let mut info = HashMap::new();
            info.insert("name".to_string(), name);
            info.insert("path".to_string(), path.to_string_lossy().to_string());
            info.insert("executables".to_string(), exes.join(", "));

            programs.push(info);
        }
    }

    Ok(programs)
}
