//! Memory CRUD + vector search

use chrono::Utc;
use rusqlite::params;
use serde_json::json;
use uuid::Uuid;

use super::{get_current_machine_id, get_db_connection, Memory, MemoryScope, MemoryType};

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
pub(super) fn row_to_memory(
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

    if let Some(mem_type) = memory_type {
        // With memory type filter: ?1 = pattern, ?2 = type, ?3 = machine_id, ?4 = limit
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at,
                        COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                        scope, machine_id
                 FROM memories
                 WHERE LOWER(content) LIKE ?1 AND type = ?2 AND (COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?3))
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?4",
            )
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
        // Without memory type filter: ?1 = pattern, ?2 = machine_id, ?3 = limit
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at,
                        COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                        scope, machine_id
                 FROM memories
                 WHERE LOWER(content) LIKE ?1 AND (COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?2))
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?3",
            )
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

    if let Some(mem_type) = memory_type {
        // With memory type filter: ?1 = type, ?2 = machine_id, ?3 = limit
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at,
                        COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                        scope, machine_id
                 FROM memories
                 WHERE type = ?1 AND (COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?2))
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?3",
            )
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
        // Without memory type filter: ?1 = machine_id, ?2 = limit
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at,
                        COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                        scope, machine_id
                 FROM memories
                 WHERE (COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?1))
                 ORDER BY importance DESC, updated_at DESC
                 LIMIT ?2",
            )
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

    // ?1 = machine_id, ?2 = limit
    let mut stmt = conn
        .prepare(
            "SELECT id, type, content, metadata, created_at, updated_at,
                    COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                    scope, machine_id
             FROM memories
             WHERE last_accessed IS NOT NULL AND (COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?1))
             ORDER BY last_accessed DESC
             LIMIT ?2",
        )
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

    // Fetch all memories with embeddings based on type filter
    if let Some(ref mem_type) = memory_type {
        // With memory type filter: ?1 = machine_id, ?2 = type
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at,
                        COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                        embedding, scope, machine_id
                 FROM memories
                 WHERE embedding IS NOT NULL AND type = ?2 AND (COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?1))",
            )
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
        // Without memory type filter: ?1 = machine_id
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, metadata, created_at, updated_at,
                        COALESCE(importance, 50), COALESCE(access_count, 0), last_accessed, source_conversation_id,
                        embedding, scope, machine_id
                 FROM memories
                 WHERE embedding IS NOT NULL AND (COALESCE(scope, 'global') = 'global' OR (scope = 'machine' AND machine_id = ?1))",
            )
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
