//! Web search operations

use serde_json::json;

use super::SearchResult;

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
