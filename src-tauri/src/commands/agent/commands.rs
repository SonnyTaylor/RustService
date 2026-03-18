//! Command execution & approval

use std::process::Command;

use chrono::Utc;
use regex::Regex;
use rusqlite::params;
use uuid::Uuid;

use super::{
    get_db_connection, get_settings, PENDING_COMMANDS,
    AgentSettings, ApprovalMode, CommandExecutionResult, CommandStatus, PendingCommand,
};

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
