//! Windows Event Log commands
//!
//! Commands for reading and filtering Windows Event Logs.

use serde::{Deserialize, Serialize};
use std::process::Command;

// ============================================================================
// Types
// ============================================================================

/// Event log source/channel information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventLogSource {
    pub name: String,
    pub display_name: String,
    pub records_count: Option<u64>,
    pub log_type: String,
}

/// Event severity level
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum EventLevel {
    Critical,
    Error,
    Warning,
    Information,
    Verbose,
    Unknown,
}

impl From<u8> for EventLevel {
    fn from(level: u8) -> Self {
        match level {
            1 => EventLevel::Critical,
            2 => EventLevel::Error,
            3 => EventLevel::Warning,
            4 => EventLevel::Information,
            5 => EventLevel::Verbose,
            _ => EventLevel::Unknown,
        }
    }
}

/// Single event log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventLogEntry {
    pub id: u64,
    pub record_id: u64,
    pub time_created: String,
    pub level: EventLevel,
    pub level_display: String,
    pub source: String,
    pub provider_name: String,
    pub message: String,
    pub task_category: Option<String>,
    pub keywords: Vec<String>,
    pub computer: String,
    pub user: Option<String>,
}

/// Query filter for event logs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventLogFilter {
    pub log_name: String,
    pub level: Option<String>, // "Error", "Warning", "Information", "All"
    pub start_time: Option<String>, // ISO 8601 format
    pub end_time: Option<String>,
    pub source_filter: Option<String>,
    pub keyword_filter: Option<String>,
    pub limit: Option<u32>,
}

/// Event log statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventLogStats {
    pub log_name: String,
    pub errors_24h: u32,
    pub warnings_24h: u32,
    pub errors_7d: u32,
    pub warnings_7d: u32,
    pub errors_30d: u32,
    pub warnings_30d: u32,
    pub critical_24h: u32,
}

// ============================================================================
// Commands
// ============================================================================

/// Get available event log sources
#[tauri::command]
pub async fn get_event_log_sources() -> Result<Vec<EventLogSource>, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"
            Get-WinEvent -ListLog * -ErrorAction SilentlyContinue | 
            Where-Object { $_.RecordCount -gt 0 } |
            Select-Object -First 20 LogName, LogType, RecordCount |
            Sort-Object -Property RecordCount -Descending |
            ForEach-Object {
                [PSCustomObject]@{
                    Name = $_.LogName
                    DisplayName = $_.LogName -replace 'Microsoft-Windows-', ''
                    RecordsCount = $_.RecordCount
                    LogType = $_.LogType
                }
            } | ConvertTo-Json -Depth 2
            "#,
        ])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() || stdout.trim() == "null" {
        // Return the most common log sources as fallback
        return Ok(vec![
            EventLogSource {
                name: "System".to_string(),
                display_name: "System".to_string(),
                records_count: None,
                log_type: "Administrative".to_string(),
            },
            EventLogSource {
                name: "Application".to_string(),
                display_name: "Application".to_string(),
                records_count: None,
                log_type: "Administrative".to_string(),
            },
            EventLogSource {
                name: "Security".to_string(),
                display_name: "Security".to_string(),
                records_count: None,
                log_type: "Administrative".to_string(),
            },
        ]);
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse log sources: {}", e))?;

    let raw_sources: Vec<serde_json::Value> = if parsed.is_array() {
        parsed.as_array().unwrap().clone()
    } else {
        vec![parsed]
    };

    let mut sources = Vec::new();
    for raw in raw_sources {
        sources.push(EventLogSource {
            name: raw["Name"].as_str().unwrap_or("Unknown").to_string(),
            display_name: raw["DisplayName"].as_str().unwrap_or("Unknown").to_string(),
            records_count: raw["RecordsCount"].as_u64(),
            log_type: raw["LogType"].as_str().unwrap_or("Unknown").to_string(),
        });
    }

    Ok(sources)
}

/// Get event log entries with optional filtering
#[tauri::command]
pub async fn get_event_logs(filter: EventLogFilter) -> Result<Vec<EventLogEntry>, String> {
    let limit = filter.limit.unwrap_or(100).min(500);

    // Build the filter hash for Get-WinEvent
    let mut filter_parts = vec![format!("LogName='{}'", filter.log_name)];

    // Add level filter
    if let Some(ref level) = filter.level {
        let level_filter = match level.to_lowercase().as_str() {
            "critical" => "Level=1",
            "error" => "Level=2",
            "warning" => "Level=3",
            "information" | "info" => "Level=4",
            "verbose" => "Level=5",
            "errors" => "Level=1,2",     // Critical + Error
            "warnings" => "Level=1,2,3", // Critical + Error + Warning
            _ => "",                     // "all" or anything else - no filter
        };
        if !level_filter.is_empty() {
            filter_parts.push(level_filter.to_string());
        }
    }

    // Add time filter
    if let Some(ref start_time) = filter.start_time {
        filter_parts.push(format!("StartTime='{}'", start_time));
    }
    if let Some(ref end_time) = filter.end_time {
        filter_parts.push(format!("EndTime='{}'", end_time));
    }

    // Add provider/source filter
    if let Some(ref source) = filter.source_filter {
        if !source.is_empty() {
            filter_parts.push(format!("ProviderName='{}'", source));
        }
    }

    let filter_hash = filter_parts.join("; ");

    let script = format!(
        r#"
        try {{
            $events = Get-WinEvent -FilterHashtable @{{ {} }} -MaxEvents {} -ErrorAction Stop
            $events | ForEach-Object {{
                $msg = $_.Message
                if ($msg.Length -gt 500) {{ $msg = $msg.Substring(0, 500) + '...' }}
                
                $levelDisplay = switch ($_.Level) {{
                    1 {{ 'Critical' }}
                    2 {{ 'Error' }}
                    3 {{ 'Warning' }}
                    4 {{ 'Information' }}
                    5 {{ 'Verbose' }}
                    default {{ 'Unknown' }}
                }}
                
                [PSCustomObject]@{{
                    Id = $_.Id
                    RecordId = $_.RecordId
                    TimeCreated = $_.TimeCreated.ToString('o')
                    Level = $_.Level
                    LevelDisplay = $levelDisplay
                    Source = $_.LogName
                    ProviderName = $_.ProviderName
                    Message = $msg
                    TaskCategory = $_.TaskDisplayName
                    Keywords = @($_.KeywordsDisplayNames)
                    Computer = $_.MachineName
                    User = if ($_.UserId) {{ $_.UserId.Value }} else {{ $null }}
                }}
            }} | ConvertTo-Json -Depth 3
        }} catch {{
            if ($_.Exception.Message -like '*No events were found*') {{
                '[]'
            }} else {{
                throw $_
            }}
        }}
        "#,
        filter_hash, limit
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("No events were found") {
            return Ok(Vec::new());
        }
        return Err(format!("Failed to query event logs: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() || stdout.trim() == "null" || stdout.trim() == "[]" {
        return Ok(Vec::new());
    }

    let parsed: serde_json::Value = serde_json::from_str(&stdout).map_err(|e| {
        format!(
            "Failed to parse events: {} - Output: {}",
            e,
            stdout.chars().take(200).collect::<String>()
        )
    })?;

    let raw_events: Vec<serde_json::Value> = if parsed.is_array() {
        parsed.as_array().unwrap().clone()
    } else {
        vec![parsed]
    };

    let mut entries = Vec::new();
    for raw in raw_events {
        let level = raw["Level"].as_u64().unwrap_or(0) as u8;

        entries.push(EventLogEntry {
            id: raw["Id"].as_u64().unwrap_or(0),
            record_id: raw["RecordId"].as_u64().unwrap_or(0),
            time_created: raw["TimeCreated"].as_str().unwrap_or("").to_string(),
            level: EventLevel::from(level),
            level_display: raw["LevelDisplay"]
                .as_str()
                .unwrap_or("Unknown")
                .to_string(),
            source: raw["Source"].as_str().unwrap_or("").to_string(),
            provider_name: raw["ProviderName"].as_str().unwrap_or("").to_string(),
            message: raw["Message"].as_str().unwrap_or("No message").to_string(),
            task_category: raw["TaskCategory"].as_str().map(|s| s.to_string()),
            keywords: raw["Keywords"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            computer: raw["Computer"].as_str().unwrap_or("").to_string(),
            user: raw["User"].as_str().map(|s| s.to_string()),
        });
    }

    Ok(entries)
}

/// Get event log statistics
#[tauri::command]
pub async fn get_event_log_stats(log_name: String) -> Result<EventLogStats, String> {
    let script = format!(
        r#"
        $now = Get-Date
        $24h = $now.AddHours(-24)
        $7d = $now.AddDays(-7)
        $30d = $now.AddDays(-30)
        
        # Critical in last 24h
        $critical24h = (Get-WinEvent -FilterHashtable @{{ LogName='{}'; Level=1; StartTime=$24h }} -ErrorAction SilentlyContinue | Measure-Object).Count
        
        # Errors in last 24h
        $errors24h = (Get-WinEvent -FilterHashtable @{{ LogName='{}'; Level=2; StartTime=$24h }} -ErrorAction SilentlyContinue | Measure-Object).Count
        
        # Warnings in last 24h
        $warnings24h = (Get-WinEvent -FilterHashtable @{{ LogName='{}'; Level=3; StartTime=$24h }} -ErrorAction SilentlyContinue | Measure-Object).Count
        
        # Errors in last 7 days
        $errors7d = (Get-WinEvent -FilterHashtable @{{ LogName='{}'; Level=2; StartTime=$7d }} -MaxEvents 1000 -ErrorAction SilentlyContinue | Measure-Object).Count
        
        # Warnings in last 7 days
        $warnings7d = (Get-WinEvent -FilterHashtable @{{ LogName='{}'; Level=3; StartTime=$7d }} -MaxEvents 1000 -ErrorAction SilentlyContinue | Measure-Object).Count
        
        # Errors in last 30 days
        $errors30d = (Get-WinEvent -FilterHashtable @{{ LogName='{}'; Level=2; StartTime=$30d }} -MaxEvents 5000 -ErrorAction SilentlyContinue | Measure-Object).Count
        
        # Warnings in last 30 days
        $warnings30d = (Get-WinEvent -FilterHashtable @{{ LogName='{}'; Level=3; StartTime=$30d }} -MaxEvents 5000 -ErrorAction SilentlyContinue | Measure-Object).Count
        
        [PSCustomObject]@{{
            LogName = '{}'
            Critical24h = $critical24h
            Errors24h = $errors24h
            Warnings24h = $warnings24h
            Errors7d = $errors7d
            Warnings7d = $warnings7d
            Errors30d = $errors30d
            Warnings30d = $warnings30d
        }} | ConvertTo-Json
        "#,
        log_name, log_name, log_name, log_name, log_name, log_name, log_name, log_name
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() {
        return Ok(EventLogStats {
            log_name,
            errors_24h: 0,
            warnings_24h: 0,
            errors_7d: 0,
            warnings_7d: 0,
            errors_30d: 0,
            warnings_30d: 0,
            critical_24h: 0,
        });
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse stats: {}", e))?;

    Ok(EventLogStats {
        log_name: parsed["LogName"].as_str().unwrap_or(&log_name).to_string(),
        errors_24h: parsed["Errors24h"].as_u64().unwrap_or(0) as u32,
        warnings_24h: parsed["Warnings24h"].as_u64().unwrap_or(0) as u32,
        errors_7d: parsed["Errors7d"].as_u64().unwrap_or(0) as u32,
        warnings_7d: parsed["Warnings7d"].as_u64().unwrap_or(0) as u32,
        errors_30d: parsed["Errors30d"].as_u64().unwrap_or(0) as u32,
        warnings_30d: parsed["Warnings30d"].as_u64().unwrap_or(0) as u32,
        critical_24h: parsed["Critical24h"].as_u64().unwrap_or(0) as u32,
    })
}

/// Search event logs by keyword in message
#[tauri::command]
pub async fn search_event_logs(
    log_name: String,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<EventLogEntry>, String> {
    let limit = limit.unwrap_or(100).min(500);

    let script = format!(
        r#"
        Get-WinEvent -LogName '{}' -MaxEvents 1000 -ErrorAction SilentlyContinue |
        Where-Object {{ $_.Message -like '*{}*' -or $_.ProviderName -like '*{}*' }} |
        Select-Object -First {} |
        ForEach-Object {{
            $msg = $_.Message
            if ($msg.Length -gt 500) {{ $msg = $msg.Substring(0, 500) + '...' }}
            
            $levelDisplay = switch ($_.Level) {{
                1 {{ 'Critical' }}
                2 {{ 'Error' }}
                3 {{ 'Warning' }}
                4 {{ 'Information' }}
                5 {{ 'Verbose' }}
                default {{ 'Unknown' }}
            }}
            
            [PSCustomObject]@{{
                Id = $_.Id
                RecordId = $_.RecordId
                TimeCreated = $_.TimeCreated.ToString('o')
                Level = $_.Level
                LevelDisplay = $levelDisplay
                Source = $_.LogName
                ProviderName = $_.ProviderName
                Message = $msg
                TaskCategory = $_.TaskDisplayName
                Keywords = @($_.KeywordsDisplayNames)
                Computer = $_.MachineName
                User = if ($_.UserId) {{ $_.UserId.Value }} else {{ $null }}
            }}
        }} | ConvertTo-Json -Depth 3
        "#,
        log_name, query, query, limit
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() || stdout.trim() == "null" {
        return Ok(Vec::new());
    }

    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse search results: {}", e))?;

    let raw_events: Vec<serde_json::Value> = if parsed.is_array() {
        parsed.as_array().unwrap().clone()
    } else {
        vec![parsed]
    };

    let mut entries = Vec::new();
    for raw in raw_events {
        let level = raw["Level"].as_u64().unwrap_or(0) as u8;

        entries.push(EventLogEntry {
            id: raw["Id"].as_u64().unwrap_or(0),
            record_id: raw["RecordId"].as_u64().unwrap_or(0),
            time_created: raw["TimeCreated"].as_str().unwrap_or("").to_string(),
            level: EventLevel::from(level),
            level_display: raw["LevelDisplay"]
                .as_str()
                .unwrap_or("Unknown")
                .to_string(),
            source: raw["Source"].as_str().unwrap_or("").to_string(),
            provider_name: raw["ProviderName"].as_str().unwrap_or("").to_string(),
            message: raw["Message"].as_str().unwrap_or("No message").to_string(),
            task_category: raw["TaskCategory"].as_str().map(|s| s.to_string()),
            keywords: raw["Keywords"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            computer: raw["Computer"].as_str().unwrap_or("").to_string(),
            user: raw["User"].as_str().map(|s| s.to_string()),
        });
    }

    Ok(entries)
}
