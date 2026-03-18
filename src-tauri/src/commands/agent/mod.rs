//! Agent commands
//!
//! Tauri commands for the agentic AI system including command execution,
//! memory management, and search functionality.

pub mod attachments;
pub mod commands;
pub mod conversations;
pub mod files;
pub mod memory;
pub mod search;

pub use attachments::*;
pub use commands::*;
pub use conversations::*;
pub use files::*;
pub use memory::*;
pub use search::*;

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

pub(super) use super::data_dir::get_data_dir_path;
pub(super) use super::settings::get_settings;
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
pub(super) static PENDING_COMMANDS: Mutex<Vec<PendingCommand>> = Mutex::new(Vec::new());

// =============================================================================
// Machine Identification
// =============================================================================

/// Get a unique identifier for the current machine
/// Uses computer name as primary identifier, which is human-readable
/// and consistent across reboots
pub(super) fn get_current_machine_id() -> String {
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

pub(super) fn get_agent_dir() -> PathBuf {
    get_data_dir_path().join("agent")
}

pub(super) fn get_memory_db_path() -> PathBuf {
    get_agent_dir().join("memory.db")
}

pub(super) fn ensure_agent_dir() -> Result<(), String> {
    let dir = get_agent_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create agent directory: {}", e))?;
    Ok(())
}

pub(super) fn get_db_connection() -> Result<Connection, String> {
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
