//! Startup Optimizer Service
//!
//! Enumerates all Windows startup items, sends them to the user's configured
//! LLM for intelligent classification (essential / useful / unnecessary),
//! and optionally disables the unnecessary ones to improve boot time.
//!
//! Falls back to heuristic pattern matching when no AI provider is configured.

use std::collections::HashMap;
use std::time::Instant;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::commands::get_settings;
use crate::commands::startup::{
    get_registry_startup_items_sync, get_scheduled_startup_tasks_sync,
    get_startup_folder_items_sync, toggle_registry_startup_item_sync,
    toggle_scheduled_task_sync, StartupItem, StartupSource,
};
use crate::services::Service;
use crate::types::{
    AgentProvider, FindingSeverity, ServiceDefinition, ServiceFinding, ServiceOptionSchema,
    ServiceResult,
};

// =============================================================================
// Classification
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Classification {
    Essential,
    Useful,
    Unnecessary,
}

impl Classification {
    fn as_str(&self) -> &'static str {
        match self {
            Classification::Essential => "essential",
            Classification::Useful => "useful",
            Classification::Unnecessary => "unnecessary",
        }
    }
}

// =============================================================================
// AI Classification
// =============================================================================

/// Build the prompt for the LLM to classify startup items.
fn build_classification_prompt(items: &[&StartupItem]) -> String {
    let mut prompt = String::from(
        r#"You are a Windows startup optimization expert. Classify each startup item as exactly one of:
- "essential": System-critical items that should NEVER be disabled (security software, hardware drivers, audio/GPU/touchpad/Bluetooth drivers, OEM hardware utilities, core Windows services)
- "useful": Items the user likely wants but that aren't system-critical (productivity tools they actively use, VPN clients, backup software). When in doubt, classify as "useful" to be conservative.
- "unnecessary": Items safe to disable for faster boot (game launchers, social/media apps that auto-start, cloud sync that can be started manually, software updaters, old utilities)

For each item, consider the name, command path, publisher, and source. Be conservative — only mark items as "unnecessary" when you're confident they aren't needed at startup.

Respond with ONLY a valid JSON object mapping each item number to its classification. Example:
{"1": "essential", "2": "unnecessary", "3": "useful"}

Items to classify:
"#,
    );

    for (i, item) in items.iter().enumerate() {
        prompt.push_str(&format!(
            "\n{}. Name: \"{}\" | Command: \"{}\" | Publisher: \"{}\" | Source: {} | Enabled: {}",
            i + 1,
            item.name,
            item.command,
            item.publisher.as_deref().unwrap_or("Unknown"),
            item.source,
            item.enabled,
        ));
    }

    prompt
}

/// Get the API base URL and key for the configured provider.
fn get_provider_config() -> Option<(String, String, String)> {
    let settings = get_settings().ok()?;
    let agent = &settings.agent;

    let (base_url, api_key, model) = match agent.provider {
        AgentProvider::OpenAI => (
            "https://api.openai.com/v1".to_string(),
            agent.api_keys.openai.clone()?,
            if agent.model.is_empty() { "gpt-4o-mini".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::Anthropic => (
            "https://api.anthropic.com".to_string(),
            agent.api_keys.anthropic.clone()?,
            if agent.model.is_empty() { "claude-sonnet-4-20250514".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::Google => (
            "https://generativelanguage.googleapis.com".to_string(),
            agent.api_keys.google.clone()?,
            if agent.model.is_empty() { "gemini-2.0-flash".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::XAI => (
            "https://api.x.ai/v1".to_string(),
            agent.api_keys.xai.clone()?,
            if agent.model.is_empty() { "grok-2-latest".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::DeepSeek => (
            "https://api.deepseek.com/v1".to_string(),
            agent.api_keys.deepseek.clone()?,
            if agent.model.is_empty() { "deepseek-chat".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::Groq => (
            "https://api.groq.com/openai/v1".to_string(),
            agent.api_keys.groq.clone()?,
            if agent.model.is_empty() { "llama-3.3-70b-versatile".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::Mistral => (
            "https://api.mistral.ai/v1".to_string(),
            agent.api_keys.mistral.clone()?,
            if agent.model.is_empty() { "mistral-small-latest".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::OpenRouter => (
            "https://openrouter.ai/api/v1".to_string(),
            agent.api_keys.openrouter.clone()?,
            if agent.model.is_empty() { "openai/gpt-4o-mini".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::Ollama => (
            agent.base_url.clone().unwrap_or_else(|| "http://localhost:11434".to_string()),
            "ollama".to_string(), // Ollama doesn't need a real key
            if agent.model.is_empty() { "llama3.2".to_string() } else { agent.model.clone() },
        ),
        AgentProvider::Custom => (
            agent.base_url.clone()?,
            agent.api_keys.custom.clone().unwrap_or_default(),
            agent.model.clone(),
        ),
    };

    // Skip if API key is empty (except Ollama)
    if api_key.is_empty() && agent.provider != AgentProvider::Ollama {
        return None;
    }

    Some((base_url, api_key, model))
}

/// Call the LLM using the OpenAI-compatible chat completions API.
/// Anthropic and Google use different APIs, handled separately.
fn call_llm_sync(prompt: &str, base_url: &str, api_key: &str, model: &str, provider: &AgentProvider) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    match provider {
        AgentProvider::Anthropic => {
            // Anthropic Messages API
            let resp = client
                .post(format!("{}/v1/messages", base_url))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&json!({
                    "model": model,
                    "max_tokens": 2048,
                    "messages": [{"role": "user", "content": prompt}],
                }))
                .send()
                .map_err(|e| format!("Anthropic API request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return Err(format!("Anthropic API error {}: {}", status, body));
            }

            let body: serde_json::Value = resp.json()
                .map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;

            body["content"][0]["text"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "No text in Anthropic response".to_string())
        }
        AgentProvider::Google => {
            // Google Gemini API
            let url = format!(
                "{}/v1beta/models/{}:generateContent?key={}",
                base_url, model, api_key
            );
            let resp = client
                .post(&url)
                .header("content-type", "application/json")
                .json(&json!({
                    "contents": [{"parts": [{"text": prompt}]}],
                }))
                .send()
                .map_err(|e| format!("Google API request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return Err(format!("Google API error {}: {}", status, body));
            }

            let body: serde_json::Value = resp.json()
                .map_err(|e| format!("Failed to parse Google response: {}", e))?;

            body["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "No text in Google response".to_string())
        }
        AgentProvider::Ollama => {
            // Ollama uses OpenAI-compatible API at /v1/chat/completions
            let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
            let resp = client
                .post(&url)
                .header("content-type", "application/json")
                .json(&json!({
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                }))
                .send()
                .map_err(|e| format!("Ollama API request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return Err(format!("Ollama API error {}: {}", status, body));
            }

            let body: serde_json::Value = resp.json()
                .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

            body["choices"][0]["message"]["content"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "No content in Ollama response".to_string())
        }
        _ => {
            // OpenAI-compatible API (OpenAI, xAI, DeepSeek, Groq, Mistral, OpenRouter, Custom)
            let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
            let resp = client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json")
                .json(&json!({
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                }))
                .send()
                .map_err(|e| format!("LLM API request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return Err(format!("LLM API error {}: {}", status, body));
            }

            let body: serde_json::Value = resp.json()
                .map_err(|e| format!("Failed to parse LLM response: {}", e))?;

            body["choices"][0]["message"]["content"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "No content in LLM response".to_string())
        }
    }
}

/// Parse the LLM's JSON response into a classification map.
fn parse_ai_classifications(response: &str, count: usize) -> HashMap<usize, Classification> {
    let mut result = HashMap::new();

    // Extract JSON from response (LLM might wrap it in markdown code blocks)
    let json_str = response
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    if let Ok(parsed) = serde_json::from_str::<HashMap<String, String>>(json_str) {
        for (key, value) in &parsed {
            if let Ok(idx) = key.parse::<usize>() {
                if idx >= 1 && idx <= count {
                    let class = match value.to_lowercase().as_str() {
                        "essential" => Classification::Essential,
                        "unnecessary" => Classification::Unnecessary,
                        _ => Classification::Useful,
                    };
                    result.insert(idx - 1, class); // Convert to 0-indexed
                }
            }
        }
    }

    result
}

/// Classify items using the configured LLM. Returns classifications + whether AI was used.
fn classify_with_ai(
    items: &[StartupItem],
    logs: &mut Vec<String>,
    app: &AppHandle,
    emit_log: &dyn Fn(&str, &mut Vec<String>, &AppHandle),
) -> (Vec<(Classification, usize)>, bool) {
    let item_refs: Vec<&StartupItem> = items.iter().collect();

    // Try AI classification
    if let Some((base_url, api_key, model)) = get_provider_config() {
        let settings = get_settings().ok();
        let provider = settings
            .as_ref()
            .map(|s| s.agent.provider.clone())
            .unwrap_or_default();

        emit_log(
            &format!("Using AI classification ({:?} / {})", provider, model),
            logs,
            app,
        );

        let prompt = build_classification_prompt(&item_refs);

        match call_llm_sync(&prompt, &base_url, &api_key, &model, &provider) {
            Ok(response) => {
                let ai_map = parse_ai_classifications(&response, items.len());

                if ai_map.len() >= items.len() / 2 {
                    // AI classified at least half — use its results
                    emit_log(
                        &format!("AI classified {}/{} items successfully", ai_map.len(), items.len()),
                        logs,
                        app,
                    );

                    let classified: Vec<(Classification, usize)> = (0..items.len())
                        .map(|i| {
                            let class = ai_map.get(&i).copied().unwrap_or(Classification::Useful);
                            (class, i)
                        })
                        .collect();

                    return (classified, true);
                } else {
                    emit_log(
                        &format!(
                            "AI returned incomplete results ({}/{}), falling back to heuristics",
                            ai_map.len(),
                            items.len()
                        ),
                        logs,
                        app,
                    );
                }
            }
            Err(e) => {
                emit_log(
                    &format!("AI classification failed: {}. Falling back to heuristics.", e),
                    logs,
                    app,
                );
            }
        }
    } else {
        emit_log(
            "No AI provider configured — using heuristic classification",
            logs,
            app,
        );
    }

    // Fallback: heuristic classification
    let classified: Vec<(Classification, usize)> = (0..items.len())
        .map(|i| (classify_item_heuristic(&items[i]), i))
        .collect();

    (classified, false)
}

// =============================================================================
// Heuristic Fallback Classification
// =============================================================================

/// Patterns that indicate an **essential** startup item (never disable).
const ESSENTIAL_PATTERNS: &[&str] = &[
    "windows security", "securityhealth", "windowsdefender", "msascui", "windows defender",
    "realtek", "rtkngui", "rthdvcpl", "dolby", "nahimic", "waves maxxaudio", "conexant", "idt audio",
    "synaptics", "elantech", "etdctrl", "alps pointing", "trackpad", "touchpad", "precision touchpad",
    "nvidia", "nvcontainer", "amd radeon", "amdrsserv", "intel graphics", "igfx",
    "bluetooth",
    "lenovo", "dell", "hp ", "asus ", "acer ", "razer synapse", "corsair", "logitech", "wacom", "steelseries",
];

/// Patterns that indicate an **unnecessary** startup item (safe to disable).
const UNNECESSARY_PATTERNS: &[&str] = &[
    "steam", "steamwebhelper", "epicgameslauncher", "epic games", "origin", "battle.net",
    "gog galaxy", "ubisoft", "uplay", "riotclient", "ea app",
    "discord", "spotify", "skype", "telegram", "slack", "zoom", "whatsapp", "viber", "signal",
    "onedrive", "dropbox", "google drive", "googledrivesync", "icloud", "box sync", "mega",
    "googleupdate", "google update", "msedge update", "adobe update", "adobearm", "jusched", "java update",
    "itunes", "ituneshelper", "apple push", "amazon music",
    "ccleaner", "utorrent", "bittorrent", "teamviewer", "anydesk", "parsec", "wallpaper engine",
];

/// Publishers that default to essential (system / OEM) unless overridden.
const ESSENTIAL_PUBLISHERS: &[&str] = &[
    "microsoft", "windows", "intel", "amd", "nvidia", "realtek", "synaptics",
    "dell", "lenovo", "hewlett", "hp inc", "asus", "acer",
];

fn classify_item_heuristic(item: &StartupItem) -> Classification {
    let name_lower = item.name.to_lowercase();
    let cmd_lower = item.command.to_lowercase();
    let pub_lower = item.publisher.as_deref().unwrap_or("").to_lowercase();

    if UNNECESSARY_PATTERNS.iter().any(|p| name_lower.contains(p) || cmd_lower.contains(p)) {
        return Classification::Unnecessary;
    }
    if ESSENTIAL_PATTERNS.iter().any(|p| name_lower.contains(p) || cmd_lower.contains(p)) {
        return Classification::Essential;
    }
    if !pub_lower.is_empty() && ESSENTIAL_PUBLISHERS.iter().any(|p| pub_lower.contains(p)) {
        return Classification::Essential;
    }
    Classification::Useful
}

// =============================================================================
// Service Implementation
// =============================================================================

pub struct StartupOptimizeService;

impl Service for StartupOptimizeService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "startup-optimize".to_string(),
            name: "Startup Optimizer".to_string(),
            description:
                "AI-powered analysis of startup programs — classifies and optionally disables unnecessary items to improve boot time"
                    .to_string(),
            category: "maintenance".to_string(),
            estimated_duration_secs: 20,
            required_programs: vec![],
            options: vec![
                ServiceOptionSchema {
                    id: "disable_unnecessary".to_string(),
                    label: "Disable Unnecessary Items".to_string(),
                    option_type: "boolean".to_string(),
                    default_value: json!(false),
                    min: None,
                    max: None,
                    options: None,
                    description: Some(
                        "Actually disable unnecessary startup items (otherwise report only)"
                            .to_string(),
                    ),
                },
                ServiceOptionSchema {
                    id: "include_disabled".to_string(),
                    label: "Include Disabled Items".to_string(),
                    option_type: "boolean".to_string(),
                    default_value: json!(false),
                    min: None,
                    max: None,
                    options: None,
                    description: Some(
                        "Include already-disabled startup items in the report".to_string(),
                    ),
                },
            ],
            icon: "rocket".to_string(),
            exclusive_resources: vec![],
            dependencies: vec![],
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "startup-optimize";

        let emit_log = |log: &str, logs: &mut Vec<String>, app: &AppHandle| {
            logs.push(log.to_string());
            let _ = app.emit(
                "service-log",
                json!({
                    "serviceId": service_id,
                    "log": log,
                    "timestamp": Utc::now().to_rfc3339()
                }),
            );
        };

        let disable_unnecessary = options
            .get("disable_unnecessary")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let include_disabled = options
            .get("include_disabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // -----------------------------------------------------------------
        // Enumerate startup items
        // -----------------------------------------------------------------
        emit_log("Enumerating startup items...", &mut logs, app);

        let mut items: Vec<StartupItem> = Vec::new();

        match get_registry_startup_items_sync() {
            Ok(mut v) => items.append(&mut v),
            Err(e) => emit_log(
                &format!("Warning: failed to get registry startup items: {}", e),
                &mut logs,
                app,
            ),
        }

        match get_startup_folder_items_sync() {
            Ok(mut v) => items.append(&mut v),
            Err(e) => emit_log(
                &format!("Warning: failed to get startup folder items: {}", e),
                &mut logs,
                app,
            ),
        }

        match get_scheduled_startup_tasks_sync() {
            Ok(mut v) => items.append(&mut v),
            Err(e) => emit_log(
                &format!("Warning: failed to get scheduled startup tasks: {}", e),
                &mut logs,
                app,
            ),
        }

        emit_log(
            &format!("Found {} startup items", items.len()),
            &mut logs,
            app,
        );

        // Optionally filter out already-disabled items
        if !include_disabled {
            items.retain(|i| i.enabled);
        }

        if items.is_empty() {
            emit_log("No startup items found.", &mut logs, app);
            findings.push(ServiceFinding {
                severity: FindingSeverity::Success,
                title: "No startup items found".to_string(),
                description: "No startup items were detected on this system.".to_string(),
                recommendation: None,
                data: Some(json!({
                    "type": "startup_optimize",
                    "mode": if disable_unnecessary { "disable" } else { "report" },
                    "aiPowered": false,
                    "totalItems": 0,
                    "essentialCount": 0,
                    "usefulCount": 0,
                    "unnecessaryCount": 0,
                    "disabledThisRun": [],
                    "failedItems": [],
                    "items": [],
                })),
            });
            return ServiceResult {
                service_id: service_id.to_string(),
                success: true,
                error: None,
                duration_ms: start.elapsed().as_millis() as u64,
                findings,
                logs,
                agent_analysis: None,
            };
        }

        // -----------------------------------------------------------------
        // Classify (AI-powered with heuristic fallback)
        // -----------------------------------------------------------------
        emit_log("Classifying startup items...", &mut logs, app);

        let (classified, ai_powered) = classify_with_ai(&items, &mut logs, app, &emit_log);

        let essential_count = classified.iter().filter(|(c, _)| *c == Classification::Essential).count();
        let useful_count = classified.iter().filter(|(c, _)| *c == Classification::Useful).count();
        let unnecessary_count = classified.iter().filter(|(c, _)| *c == Classification::Unnecessary).count();
        let unnecessary_enabled: Vec<usize> = classified
            .iter()
            .filter(|(c, i)| *c == Classification::Unnecessary && items[*i].enabled)
            .map(|(_, i)| *i)
            .collect();

        emit_log(
            &format!(
                "Essential: {}, Useful: {}, Unnecessary: {} ({})",
                essential_count, useful_count, unnecessary_count,
                if ai_powered { "AI-classified" } else { "heuristic" },
            ),
            &mut logs,
            app,
        );

        // -----------------------------------------------------------------
        // Optionally disable
        // -----------------------------------------------------------------
        let mut disabled_items: Vec<String> = Vec::new();
        let mut failed_items: Vec<(String, String)> = Vec::new();

        if disable_unnecessary && !unnecessary_enabled.is_empty() {
            emit_log("Disabling unnecessary startup items...", &mut logs, app);

            for &idx in &unnecessary_enabled {
                let item = &items[idx];

                // Skip startup folder items (require deletion)
                if item.source == StartupSource::StartupFolderUser
                    || item.source == StartupSource::StartupFolderAllUsers
                {
                    emit_log(
                        &format!(
                            "Skipping '{}' (startup folder item — remove manually)",
                            item.name
                        ),
                        &mut logs,
                        app,
                    );
                    continue;
                }

                let result = if item.id.starts_with("reg_") {
                    toggle_registry_startup_item_sync(&item.id[4..], false)
                } else if item.id.starts_with("task_") {
                    toggle_scheduled_task_sync(&item.id[5..], false)
                } else {
                    Err(format!("Unknown item type: {}", item.id))
                };

                match result {
                    Ok(()) => {
                        emit_log(
                            &format!("Disabled: {}", item.name),
                            &mut logs,
                            app,
                        );
                        disabled_items.push(item.name.clone());
                    }
                    Err(e) => {
                        emit_log(
                            &format!("Failed to disable '{}': {}", item.name, e),
                            &mut logs,
                            app,
                        );
                        failed_items.push((item.name.clone(), e));
                    }
                }
            }
        }

        // -----------------------------------------------------------------
        // Build findings
        // -----------------------------------------------------------------

        let items_data: Vec<serde_json::Value> = classified
            .iter()
            .map(|(class, idx)| {
                let item = &items[*idx];
                json!({
                    "id": item.id,
                    "name": item.name,
                    "command": item.command,
                    "source": item.source,
                    "sourceLocation": item.source_location,
                    "enabled": item.enabled,
                    "publisher": item.publisher,
                    "description": item.description,
                    "classification": class.as_str(),
                    "disabledThisRun": disabled_items.contains(&item.name),
                })
            })
            .collect();

        let mode = if disable_unnecessary { "disable" } else { "report" };

        let severity = if unnecessary_enabled.is_empty() {
            FindingSeverity::Success
        } else if disable_unnecessary && failed_items.is_empty() {
            FindingSeverity::Success
        } else {
            FindingSeverity::Warning
        };

        let title = if disable_unnecessary {
            if disabled_items.is_empty() {
                "No unnecessary items to disable".to_string()
            } else {
                format!("Disabled {} unnecessary startup item(s)", disabled_items.len())
            }
        } else if unnecessary_enabled.is_empty() {
            "No unnecessary startup items found".to_string()
        } else {
            format!(
                "{} unnecessary startup item(s) found",
                unnecessary_enabled.len()
            )
        };

        let description = format!(
            "{} startup items analyzed{}: {} essential, {} useful, {} unnecessary.",
            classified.len(),
            if ai_powered { " by AI" } else { "" },
            essential_count,
            useful_count,
            unnecessary_count,
        );

        let recommendation = if !disable_unnecessary && !unnecessary_enabled.is_empty() {
            Some("Re-run with \"Disable Unnecessary Items\" enabled to automatically disable these items.".to_string())
        } else {
            None
        };

        findings.push(ServiceFinding {
            severity,
            title,
            description,
            recommendation,
            data: Some(json!({
                "type": "startup_optimize",
                "mode": mode,
                "aiPowered": ai_powered,
                "totalItems": classified.len(),
                "essentialCount": essential_count,
                "usefulCount": useful_count,
                "unnecessaryCount": unnecessary_count,
                "disabledThisRun": disabled_items,
                "failedItems": failed_items.iter().map(|(n, e)| json!({"name": n, "error": e})).collect::<Vec<_>>(),
                "items": items_data,
            })),
        });

        // Individual warnings for unnecessary enabled items (report mode)
        if !disable_unnecessary {
            for &idx in &unnecessary_enabled {
                let item = &items[idx];
                findings.push(ServiceFinding {
                    severity: FindingSeverity::Warning,
                    title: format!("Unnecessary: {}", item.name),
                    description: format!(
                        "Source: {} | Publisher: {} | Command: {}",
                        item.source,
                        item.publisher.as_deref().unwrap_or("Unknown"),
                        item.command,
                    ),
                    recommendation: Some(
                        "Consider disabling this startup item to improve boot time.".to_string(),
                    ),
                    data: None,
                });
            }
        }

        // Failures
        for (name, error) in &failed_items {
            findings.push(ServiceFinding {
                severity: FindingSeverity::Error,
                title: format!("Failed to disable: {}", name),
                description: error.clone(),
                recommendation: Some("Try running as administrator.".to_string()),
                data: None,
            });
        }

        emit_log("Startup optimization complete.", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            findings,
            logs,
            agent_analysis: None,
        }
    }
}
