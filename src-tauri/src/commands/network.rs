//! Network testing commands
//!
//! Commands for testing network connectivity and latency.

use serde::Serialize;
use std::time::Instant;

/// Network test results
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTestResult {
    pub is_online: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

/// Test network connectivity and latency
#[tauri::command]
pub async fn test_network_latency() -> NetworkTestResult {
    // Test connectivity by making requests to multiple endpoints
    let endpoints = [
        "https://www.google.com",
        "https://cloudflare.com",
        "https://www.microsoft.com",
    ];

    let mut latencies: Vec<u64> = Vec::new();

    for endpoint in &endpoints {
        let start = Instant::now();
        match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
        {
            Ok(client) => match client.head(*endpoint).send().await {
                Ok(response) => {
                    if response.status().is_success() || response.status().is_redirection() {
                        latencies.push(start.elapsed().as_millis() as u64);
                    }
                }
                Err(_) => continue,
            },
            Err(_) => continue,
        }
    }

    if latencies.is_empty() {
        NetworkTestResult {
            is_online: false,
            latency_ms: None,
            error: Some("Could not reach any test endpoints".to_string()),
        }
    } else {
        let avg_latency = latencies.iter().sum::<u64>() / latencies.len() as u64;
        NetworkTestResult {
            is_online: true,
            latency_ms: Some(avg_latency),
            error: None,
        }
    }
}
