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
    AgentSettings, ApprovalMode, CommandExecutionResult, CommandStatus, Conversation,
    ConversationMessage, ConversationWithMessages, Memory, MemoryScope, MemoryType, PendingCommand,
    SearchResult,
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
// Machine Identification
// =============================================================================

/// Get a unique identifier for the current machine
/// Uses computer name as primary identifier, which is human-readable
/// and consistent across reboots
fn get_current_machine_id() -> String {
    // Use the COMPUTERNAME environment variable on Windows
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| {
            gethostname::gethostname()
                .into_string()
                .map_err(|_| std::env::VarError::NotPresent)
        })
        .unwrap_or_else(|_| "unknown-machine".to_string())
}

/// Get the current machine identifier (exposed to frontend)
#[tauri::command]
pub fn get_machine_id() -> Result<String, String> {
    Ok(get_current_machine_id())
}

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
            updated_at TEXT NOT NULL,
            importance INTEGER DEFAULT 50,
            access_count INTEGER DEFAULT 0,
            last_accessed TEXT,
            source_conversation_id TEXT,
            scope TEXT DEFAULT 'global',
            machine_id TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create memories table: {}", e))?;

    // Migration: Add new columns if they don't exist (for existing databases)
    let _ = conn.execute(
        "ALTER TABLE memories ADD COLUMN importance INTEGER DEFAULT 50",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE memories ADD COLUMN access_count INTEGER DEFAULT 0",
        [],
    );
    let _ = conn.execute("ALTER TABLE memories ADD COLUMN last_accessed TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE memories ADD COLUMN source_conversation_id TEXT",
        [],
    );
    // Migration: Add scope and machine_id for portable memory system
    let _ = conn.execute(
        "ALTER TABLE memories ADD COLUMN scope TEXT DEFAULT 'global'",
        [],
    );
    let _ = conn.execute("ALTER TABLE memories ADD COLUMN machine_id TEXT", []);

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

    // Create index for importance-based queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC)",
        [],
    )
    .map_err(|e| format!("Failed to create importance index: {}", e))?;

    // Create index for access count queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_access_count ON memories(access_count DESC)",
        [],
    )
    .map_err(|e| format!("Failed to create access count index: {}", e))?;

    // Create index for scope-based queries (portable memory system)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope)",
        [],
    )
    .map_err(|e| format!("Failed to create scope index: {}", e))?;

    // Create index for machine_id queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_machine_id ON memories(machine_id)",
        [],
    )
    .map_err(|e| format!("Failed to create machine_id index: {}", e))?;

    // Conversations table for chat persistence
    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create conversations table: {}", e))?;

    // Messages within conversations
    conn.execute(
        "CREATE TABLE IF NOT EXISTS conversation_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Failed to create conversation_messages table: {}", e))?;

    // Index for faster message queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv_id ON conversation_messages(conversation_id)",
        [],
    )
    .map_err(|e| format!("Failed to create conversation messages index: {}", e))?;

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
///
/// The `scope` parameter determines memory portability:
/// - "global": Travels with the technician across machines (solutions, knowledge, behaviors)
/// - "machine": Specific to current machine (system info, local context)
///
/// If scope is not provided, it defaults based on memory type:
/// - system, conversation, summary -> machine scope
/// - fact, solution, knowledge, behavior, instruction -> global scope
#[tauri::command]
pub fn save_memory(
    memory_type: String,
    content: String,
    metadata: Option<serde_json::Value>,
    embedding: Option<Vec<f32>>,
    importance: Option<i32>,
    source_conversation_id: Option<String>,
    scope: Option<String>,
) -> Result<Memory, String> {
    let conn = get_db_connection()?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let importance_val = importance.unwrap_or(50);

    // Clone metadata for later use
    let metadata_for_return = metadata.clone().unwrap_or(json!({}));

    let meta_str = metadata
        .map(|m| serde_json::to_string(&m).unwrap_or_default())
        .unwrap_or_else(|| "{}".to_string());

    // Convert embedding to bytes if provided
    let embedding_bytes: Option<Vec<u8>> =
        embedding.map(|e| e.iter().flat_map(|f| f.to_le_bytes().to_vec()).collect());

    // Determine scope - use provided value or default based on memory type
    let mem_type = MemoryType::from_str(&memory_type);
    let memory_scope = scope
        .map(|s| MemoryScope::from_str(&s))
        .unwrap_or_else(|| MemoryScope::default_for_type(&mem_type));
    let scope_str = memory_scope.as_str().to_string();

    // Only set machine_id for machine-scoped memories
    let machine_id = if memory_scope == MemoryScope::Machine {
        Some(get_current_machine_id())
    } else {
        None
    };

    conn.execute(
        "INSERT INTO memories (id, type, content, embedding, metadata, created_at, updated_at, importance, access_count, last_accessed, source_conversation_id, scope, machine_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            id,
            memory_type,
            content,
            embedding_bytes,
            meta_str,
            now,
            now,
            importance_val,
            0,
            Option::<String>::None,
            source_conversation_id,
            scope_str,
            machine_id
        ],
    )
    .map_err(|e| format!("Failed to save memory: {}", e))?;

    Ok(Memory {
        id,
        memory_type: mem_type,
        content,
        metadata: metadata_for_return,
        created_at: now.clone(),
        updated_at: now,
        importance: importance_val,
        access_count: 0,
        last_accessed: None,
        source_conversation_id,
        scope: memory_scope,
        machine_id,
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
    importance: i32,
    access_count: i32,
    last_accessed: Option<String>,
    source_conversation_id: Option<String>,
    scope_str: Option<String>,
    machine_id: Option<String>,
) -> Memory {
    let mem_type = MemoryType::from_str(&type_str);
    let metadata: serde_json::Value = serde_json::from_str(&meta_str).unwrap_or(json!({}));
    let scope = MemoryScope::from_str(&scope_str.unwrap_or_else(|| "global".to_string()));

    Memory {
        id,
        memory_type: mem_type,
        content,
        metadata,
        created_at,
        updated_at,
        importance,
        access_count,
        last_accessed,
        source_conversation_id,
        scope,
        machine_id,
    }
}

/// Search memories by text (simple substring search)
///
/// Respects memory scope:
/// - Global memories are always returned
/// - Machine-scoped memories only returned if they match current machine
#[tauri::command]
pub fn search_memories(
    query: String,
    memory_type: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Memory>, String> {
    let conn = get_db_connection()?;
    let current_machine = get_current_machine_id();

    let limit_val = limit.unwrap_or(10) as i64;
    let search_pattern = format!("%{}%", query.to_lowercase());

    let mut memories = Vec::new();

    // Scope filter: global memories OR machine-scoped with matching machine_id
    let scope_filter =
        "(COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?))";

    if let Some(mem_type) = memory_type {
        let query_str = format!(
            "SELECT id, type, content, metadata, created_at, updated_at, 
                    COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                    scope, machine_id
             FROM memories 
             WHERE LOWER(content) LIKE ?1 AND type = ?2 AND {}
             ORDER BY importance DESC, updated_at DESC
             LIMIT ?3",
            scope_filter
        );

        let mut stmt = conn
            .prepare(&query_str)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(
                params![search_pattern, mem_type, current_machine, limit_val],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, i32>(6)?,
                        row.get::<_, i32>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                        row.get::<_, Option<String>>(10)?,
                        row.get::<_, Option<String>>(11)?,
                    ))
                },
            )
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                scope,
                machine_id,
            ) = row.map_err(|e| format!("Failed to read row: {}", e))?;
            memories.push(row_to_memory(
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                scope,
                machine_id,
            ));
        }
    } else {
        let query_str = format!(
            "SELECT id, type, content, metadata, created_at, updated_at,
                    COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                    scope, machine_id
             FROM memories 
             WHERE LOWER(content) LIKE ?1 AND {}
             ORDER BY importance DESC, updated_at DESC
             LIMIT ?2",
            scope_filter
        );

        let mut stmt = conn
            .prepare(&query_str)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![search_pattern, current_machine, limit_val], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, i32>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                scope,
                machine_id,
            ) = row.map_err(|e| format!("Failed to read row: {}", e))?;
            memories.push(row_to_memory(
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                scope,
                machine_id,
            ));
        }
    }

    Ok(memories)
}

/// Get all memories
///
/// Respects memory scope:
/// - Global memories are always returned
/// - Machine-scoped memories only returned if they match current machine
#[tauri::command]
pub fn get_all_memories(
    memory_type: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Memory>, String> {
    let conn = get_db_connection()?;
    let current_machine = get_current_machine_id();
    let limit_val = limit.unwrap_or(100) as i64;

    let mut memories = Vec::new();

    // Scope filter: global memories OR machine-scoped with matching machine_id
    let scope_filter =
        "(COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?))";

    if let Some(mem_type) = memory_type {
        let query_str = format!(
            "SELECT id, type, content, metadata, created_at, updated_at,
                    COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                    scope, machine_id
             FROM memories 
             WHERE type = ?1 AND {}
             ORDER BY importance DESC, updated_at DESC
             LIMIT ?2",
            scope_filter
        );

        let mut stmt = conn
            .prepare(&query_str)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![mem_type, current_machine, limit_val], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, i32>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                scope,
                machine_id,
            ) = row.map_err(|e| format!("Failed to read row: {}", e))?;
            memories.push(row_to_memory(
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                scope,
                machine_id,
            ));
        }
    } else {
        let query_str = format!(
            "SELECT id, type, content, metadata, created_at, updated_at,
                    COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                    scope, machine_id
             FROM memories 
             WHERE {}
             ORDER BY importance DESC, updated_at DESC
             LIMIT ?1",
            scope_filter
        );

        let mut stmt = conn
            .prepare(&query_str)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![current_machine, limit_val], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, i32>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                scope,
                machine_id,
            ) = row.map_err(|e| format!("Failed to read row: {}", e))?;
            memories.push(row_to_memory(
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                scope,
                machine_id,
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

/// Update an existing memory entry
#[tauri::command]
pub fn update_memory(
    memory_id: String,
    content: Option<String>,
    metadata: Option<serde_json::Value>,
    importance: Option<i32>,
) -> Result<Memory, String> {
    let conn = get_db_connection()?;
    let now = Utc::now().to_rfc3339();

    // Execute update based on provided fields
    match (content.as_ref(), metadata.as_ref(), importance) {
        (Some(c), Some(m), Some(i)) => {
            let meta_str = serde_json::to_string(m).unwrap_or_default();
            conn.execute(
                "UPDATE memories SET updated_at = ?1, content = ?2, metadata = ?3, importance = ?4 WHERE id = ?5",
                params![now, c, meta_str, i, memory_id],
            )
        }
        (Some(c), Some(m), None) => {
            let meta_str = serde_json::to_string(m).unwrap_or_default();
            conn.execute(
                "UPDATE memories SET updated_at = ?1, content = ?2, metadata = ?3 WHERE id = ?4",
                params![now, c, meta_str, memory_id],
            )
        }
        (Some(c), None, Some(i)) => conn.execute(
            "UPDATE memories SET updated_at = ?1, content = ?2, importance = ?3 WHERE id = ?4",
            params![now, c, i, memory_id],
        ),
        (Some(c), None, None) => conn.execute(
            "UPDATE memories SET updated_at = ?1, content = ?2 WHERE id = ?3",
            params![now, c, memory_id],
        ),
        (None, Some(m), Some(i)) => {
            let meta_str = serde_json::to_string(m).unwrap_or_default();
            conn.execute(
                "UPDATE memories SET updated_at = ?1, metadata = ?2, importance = ?3 WHERE id = ?4",
                params![now, meta_str, i, memory_id],
            )
        }
        (None, Some(m), None) => {
            let meta_str = serde_json::to_string(m).unwrap_or_default();
            conn.execute(
                "UPDATE memories SET updated_at = ?1, metadata = ?2 WHERE id = ?3",
                params![now, meta_str, memory_id],
            )
        }
        (None, None, Some(i)) => conn.execute(
            "UPDATE memories SET updated_at = ?1, importance = ?2 WHERE id = ?3",
            params![now, i, memory_id],
        ),
        (None, None, None) => conn.execute(
            "UPDATE memories SET updated_at = ?1 WHERE id = ?2",
            params![now, memory_id],
        ),
    }
    .map_err(|e| format!("Failed to update memory: {}", e))?;

    // Fetch and return updated memory
    let mut stmt = conn
        .prepare(
            "SELECT id, type, content, metadata, created_at, updated_at,
                    COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                    scope, machine_id
             FROM memories WHERE id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let memory = stmt
        .query_row(params![memory_id], |row| {
            Ok(row_to_memory(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
                row.get(11)?,
            ))
        })
        .map_err(|e| format!("Memory not found: {}", e))?;

    Ok(memory)
}

/// Delete multiple memories by IDs
#[tauri::command]
pub fn bulk_delete_memories(memory_ids: Vec<String>) -> Result<usize, String> {
    let conn = get_db_connection()?;

    let mut deleted = 0;
    for id in memory_ids {
        let result = conn.execute("DELETE FROM memories WHERE id = ?1", params![id]);
        if result.is_ok() {
            deleted += 1;
        }
    }

    Ok(deleted)
}

/// Get memory statistics
#[tauri::command]
pub fn get_memory_stats() -> Result<crate::types::MemoryStats, String> {
    let conn = get_db_connection()?;

    // Get total count
    let total_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM memories", [], |row| row.get(0))
        .unwrap_or(0);

    // Get count by type
    let mut stmt = conn
        .prepare("SELECT type, COUNT(*) FROM memories GROUP BY type")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let mut by_type = std::collections::HashMap::new();
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    for row in rows {
        let (type_str, count) = row.map_err(|e| format!("Failed to read row: {}", e))?;
        by_type.insert(type_str, count);
    }

    // Estimate total size (content length)
    let total_size_bytes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(LENGTH(content)), 0) FROM memories",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(crate::types::MemoryStats {
        total_count,
        by_type,
        total_size_bytes,
    })
}

/// Increment memory access count and update last_accessed timestamp
#[tauri::command]
pub fn increment_memory_access(memory_id: String) -> Result<(), String> {
    let conn = get_db_connection()?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE memories SET access_count = COALESCE(access_count, 0) + 1, last_accessed = ?1 WHERE id = ?2",
        params![now, memory_id],
    )
    .map_err(|e| format!("Failed to increment access count: {}", e))?;

    Ok(())
}

/// Get recently accessed memories
///
/// Respects memory scope:
/// - Global memories are always returned
/// - Machine-scoped memories only returned if they match current machine
#[tauri::command]
pub fn get_recent_memories(limit: Option<usize>) -> Result<Vec<Memory>, String> {
    let conn = get_db_connection()?;
    let current_machine = get_current_machine_id();
    let limit_val = limit.unwrap_or(10) as i64;

    // Scope filter: global memories OR machine-scoped with matching machine_id
    let scope_filter =
        "(COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?))";

    let query_str = format!(
        "SELECT id, type, content, metadata, created_at, updated_at,
                COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                scope, machine_id
         FROM memories 
         WHERE last_accessed IS NOT NULL AND {}
         ORDER BY last_accessed DESC
         LIMIT ?1",
        scope_filter
    );

    let mut stmt = conn
        .prepare(&query_str)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map(params![current_machine, limit_val], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i32>(6)?,
                row.get::<_, i32>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, Option<String>>(11)?,
            ))
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    let mut memories = Vec::new();
    for row in rows {
        let (
            id,
            type_str,
            content,
            meta_str,
            created_at,
            updated_at,
            importance,
            access_count,
            last_accessed,
            source_conversation_id,
            scope,
            machine_id,
        ) = row.map_err(|e| format!("Failed to read row: {}", e))?;
        memories.push(row_to_memory(
            id,
            type_str,
            content,
            meta_str,
            created_at,
            updated_at,
            importance,
            access_count,
            last_accessed,
            source_conversation_id,
            scope,
            machine_id,
        ));
    }

    Ok(memories)
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
///
/// Respects memory scope:
/// - Global memories are always returned
/// - Machine-scoped memories only returned if they match current machine
#[tauri::command]
pub fn search_memories_vector(
    embedding: Vec<f32>,
    memory_type: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Memory>, String> {
    let conn = get_db_connection()?;
    let current_machine = get_current_machine_id();
    let limit_val = limit.unwrap_or(5);

    let mut scored_memories = Vec::new();

    // Scope filter: global memories OR machine-scoped with matching machine_id
    let scope_filter =
        "(COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?1))";

    // Fetch all memories with embeddings based on type filter
    if let Some(ref mem_type) = memory_type {
        let query_str = format!(
            "SELECT id, type, content, metadata, created_at, updated_at, 
                    COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id, 
                    embedding, scope, machine_id 
             FROM memories 
             WHERE embedding IS NOT NULL AND type = ?2 AND {}",
            scope_filter
        );

        let mut stmt = conn
            .prepare(&query_str)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![current_machine, mem_type], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, i32>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Vec<u8>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                embedding_bytes,
                scope,
                machine_id,
            ) = row.map_err(|e| format!("Failed to read row: {}", e))?;

            let stored_embedding: Vec<f32> = embedding_bytes
                .chunks(4)
                .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap()))
                .collect();

            if stored_embedding.len() == embedding.len() {
                let score = cosine_similarity(&embedding, &stored_embedding);
                scored_memories.push((
                    score,
                    row_to_memory(
                        id,
                        type_str,
                        content,
                        meta_str,
                        created_at,
                        updated_at,
                        importance,
                        access_count,
                        last_accessed,
                        source_conversation_id,
                        scope,
                        machine_id,
                    ),
                ));
            }
        }
    } else {
        let query_str = format!(
            "SELECT id, type, content, metadata, created_at, updated_at, 
                    COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id, 
                    embedding, scope, machine_id 
             FROM memories 
             WHERE embedding IS NOT NULL AND {}",
            scope_filter
        );

        let mut stmt = conn
            .prepare(&query_str)
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let rows = stmt
            .query_map(params![current_machine], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, i32>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Vec<u8>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                ))
            })
            .map_err(|e| format!("Failed to execute query: {}", e))?;

        for row in rows {
            let (
                id,
                type_str,
                content,
                meta_str,
                created_at,
                updated_at,
                importance,
                access_count,
                last_accessed,
                source_conversation_id,
                embedding_bytes,
                scope,
                machine_id,
            ) = row.map_err(|e| format!("Failed to read row: {}", e))?;

            let stored_embedding: Vec<f32> = embedding_bytes
                .chunks(4)
                .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap()))
                .collect();

            if stored_embedding.len() == embedding.len() {
                let score = cosine_similarity(&embedding, &stored_embedding);
                scored_memories.push((
                    score,
                    row_to_memory(
                        id,
                        type_str,
                        content,
                        meta_str,
                        created_at,
                        updated_at,
                        importance,
                        access_count,
                        last_accessed,
                        source_conversation_id,
                        scope,
                        machine_id,
                    ),
                ));
            }
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

// =============================================================================
// Conversation Operations
// =============================================================================

/// Create a new conversation
#[tauri::command]
pub fn create_conversation(title: Option<String>) -> Result<Conversation, String> {
    let conn = get_db_connection()?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let conversation_title = title.unwrap_or_else(|| "New Chat".to_string());

    conn.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, conversation_title, now, now],
    )
    .map_err(|e| format!("Failed to create conversation: {}", e))?;

    Ok(Conversation {
        id,
        title: conversation_title,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// List all conversations
#[tauri::command]
pub fn list_conversations(limit: Option<usize>) -> Result<Vec<Conversation>, String> {
    let conn = get_db_connection()?;
    let limit_val = limit.unwrap_or(50) as i64;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, created_at, updated_at 
             FROM conversations 
             ORDER BY updated_at DESC 
             LIMIT ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map(params![limit_val], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    let mut conversations = Vec::new();
    for row in rows {
        conversations.push(row.map_err(|e| format!("Failed to read row: {}", e))?);
    }

    Ok(conversations)
}

/// Get a conversation with its messages
#[tauri::command]
pub fn get_conversation(conversation_id: String) -> Result<ConversationWithMessages, String> {
    let conn = get_db_connection()?;

    // Get conversation
    let conversation: Conversation = conn
        .query_row(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?1",
            params![conversation_id],
            |row| {
                Ok(Conversation {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            },
        )
        .map_err(|e| format!("Conversation not found: {}", e))?;

    // Get messages
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, created_at 
             FROM conversation_messages 
             WHERE conversation_id = ?1 
             ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map(params![conversation_id], |row| {
            Ok(ConversationMessage {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| format!("Failed to read row: {}", e))?);
    }

    Ok(ConversationWithMessages {
        conversation,
        messages,
    })
}

/// Save messages to a conversation (replaces existing messages)
#[tauri::command]
pub fn save_conversation_messages(
    conversation_id: String,
    messages: Vec<ConversationMessage>,
) -> Result<(), String> {
    let conn = get_db_connection()?;
    let now = Utc::now().to_rfc3339();

    // Delete existing messages for this conversation
    conn.execute(
        "DELETE FROM conversation_messages WHERE conversation_id = ?1",
        params![conversation_id],
    )
    .map_err(|e| format!("Failed to delete old messages: {}", e))?;

    // Insert new messages
    for msg in messages {
        conn.execute(
            "INSERT INTO conversation_messages (id, conversation_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                msg.id,
                conversation_id,
                msg.role,
                msg.content,
                msg.created_at
            ],
        )
        .map_err(|e| format!("Failed to insert message: {}", e))?;
    }

    // Update conversation's updated_at
    conn.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        params![now, conversation_id],
    )
    .map_err(|e| format!("Failed to update conversation: {}", e))?;

    Ok(())
}

/// Update conversation title
#[tauri::command]
pub fn update_conversation_title(conversation_id: String, title: String) -> Result<(), String> {
    let conn = get_db_connection()?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now, conversation_id],
    )
    .map_err(|e| format!("Failed to update conversation title: {}", e))?;

    Ok(())
}

/// Delete a conversation and its messages
#[tauri::command]
pub fn delete_conversation(conversation_id: String) -> Result<(), String> {
    let conn = get_db_connection()?;

    // Delete messages first (in case foreign key cascade doesn't work)
    conn.execute(
        "DELETE FROM conversation_messages WHERE conversation_id = ?1",
        params![conversation_id],
    )
    .map_err(|e| format!("Failed to delete messages: {}", e))?;

    // Delete conversation
    conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![conversation_id],
    )
    .map_err(|e| format!("Failed to delete conversation: {}", e))?;

    Ok(())
}
