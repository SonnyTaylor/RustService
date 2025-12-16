//! Network diagnostics commands
//!
//! Advanced network diagnostic tools including ping, traceroute,
//! DNS lookup, and WiFi signal information.

use serde::{Deserialize, Serialize};
use std::process::Command;

// ============================================================================
// Types
// ============================================================================

/// Detailed network interface information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterfaceDetails {
    pub name: String,
    pub description: String,
    pub mac_address: Option<String>,
    pub ipv4_addresses: Vec<String>,
    pub ipv6_addresses: Vec<String>,
    pub gateway: Option<String>,
    pub dns_servers: Vec<String>,
    pub status: String,
    pub speed_mbps: Option<u64>,
    pub interface_type: String,
}

/// Ping result for a single host
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub host: String,
    pub resolved_ip: Option<String>,
    pub packets_sent: u32,
    pub packets_received: u32,
    pub packet_loss_percent: f32,
    pub min_ms: Option<f32>,
    pub max_ms: Option<f32>,
    pub avg_ms: Option<f32>,
    pub replies: Vec<PingReply>,
    pub error: Option<String>,
}

/// Individual ping reply
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingReply {
    pub seq: u32,
    pub ttl: Option<u32>,
    pub time_ms: Option<f32>,
    pub status: String,
}

/// Traceroute result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TracerouteResult {
    pub host: String,
    pub resolved_ip: Option<String>,
    pub hops: Vec<TracerouteHop>,
    pub completed: bool,
    pub error: Option<String>,
}

/// Single hop in a traceroute
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TracerouteHop {
    pub hop_number: u32,
    pub hostname: Option<String>,
    pub ip_address: Option<String>,
    pub rtt1_ms: Option<f32>,
    pub rtt2_ms: Option<f32>,
    pub rtt3_ms: Option<f32>,
    pub timed_out: bool,
}

/// DNS lookup result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsLookupResult {
    pub query: String,
    pub query_type: String,
    pub answers: Vec<DnsRecord>,
    pub response_time_ms: u64,
    pub server_used: Option<String>,
    pub error: Option<String>,
}

/// DNS record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsRecord {
    pub record_type: String,
    pub value: String,
    pub ttl: Option<u32>,
}

/// WiFi information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiInfo {
    pub connected: bool,
    pub ssid: Option<String>,
    pub bssid: Option<String>,
    pub signal_percent: Option<u32>,
    pub channel: Option<u32>,
    pub frequency_mhz: Option<u32>,
    pub radio_type: Option<String>,
    pub authentication: Option<String>,
    pub receive_rate_mbps: Option<f32>,
    pub transmit_rate_mbps: Option<f32>,
    pub error: Option<String>,
}

// ============================================================================
// Commands
// ============================================================================

/// Get detailed information about all network interfaces
#[tauri::command]
pub async fn get_detailed_network_info() -> Result<Vec<NetworkInterfaceDetails>, String> {
    // Use PowerShell to get detailed network adapter info
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"
            Get-NetAdapter | ForEach-Object {
                $adapter = $_
                $config = Get-NetIPConfiguration -InterfaceIndex $_.ifIndex -ErrorAction SilentlyContinue
                $ipv4 = Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
                $ipv6 = Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue
                
                [PSCustomObject]@{
                    Name = $adapter.Name
                    Description = $adapter.InterfaceDescription
                    MacAddress = $adapter.MacAddress
                    Status = $adapter.Status
                    SpeedMbps = if ($adapter.LinkSpeed) { [math]::Round($adapter.LinkSpeed / 1000000) } else { $null }
                    InterfaceType = $adapter.MediaType
                    IPv4Addresses = @($ipv4.IPAddress)
                    IPv6Addresses = @($ipv6.IPAddress | Where-Object { $_ -notlike 'fe80*' })
                    Gateway = $config.IPv4DefaultGateway.NextHop
                    DnsServers = @($config.DNSServer.ServerAddresses)
                }
            } | ConvertTo-Json -Depth 3
            "#,
        ])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Handle empty output
    if stdout.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Parse JSON - handle both array and single object cases
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse network info: {}", e))?;

    let adapters: Vec<serde_json::Value> = if parsed.is_array() {
        parsed.as_array().unwrap().clone()
    } else {
        vec![parsed]
    };

    let mut interfaces = Vec::new();
    for adapter in adapters {
        interfaces.push(NetworkInterfaceDetails {
            name: adapter["Name"].as_str().unwrap_or("Unknown").to_string(),
            description: adapter["Description"].as_str().unwrap_or("").to_string(),
            mac_address: adapter["MacAddress"].as_str().map(|s| s.to_string()),
            ipv4_addresses: adapter["IPv4Addresses"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            ipv6_addresses: adapter["IPv6Addresses"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            gateway: adapter["Gateway"].as_str().map(|s| s.to_string()),
            dns_servers: adapter["DnsServers"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            status: adapter["Status"].as_str().unwrap_or("Unknown").to_string(),
            speed_mbps: adapter["SpeedMbps"].as_u64(),
            interface_type: adapter["InterfaceType"]
                .as_str()
                .unwrap_or("Unknown")
                .to_string(),
        });
    }

    Ok(interfaces)
}

/// Ping a host and return detailed results
#[tauri::command]
pub async fn ping_host(host: String, count: u32) -> PingResult {
    let count = count.min(20).max(1); // Limit between 1-20

    let output = match Command::new("ping")
        .args(["-n", &count.to_string(), &host])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return PingResult {
                host,
                resolved_ip: None,
                packets_sent: 0,
                packets_received: 0,
                packet_loss_percent: 100.0,
                min_ms: None,
                max_ms: None,
                avg_ms: None,
                replies: Vec::new(),
                error: Some(format!("Failed to execute ping: {}", e)),
            };
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ping_output(&host, &stdout, count)
}

/// Parse Windows ping output
fn parse_ping_output(host: &str, output: &str, count: u32) -> PingResult {
    let mut result = PingResult {
        host: host.to_string(),
        resolved_ip: None,
        packets_sent: count,
        packets_received: 0,
        packet_loss_percent: 100.0,
        min_ms: None,
        max_ms: None,
        avg_ms: None,
        replies: Vec::new(),
        error: None,
    };

    let lines: Vec<&str> = output.lines().collect();
    let mut seq = 0;

    for line in &lines {
        // Extract resolved IP from "Pinging host [IP]" line
        if line.contains("Pinging") && line.contains('[') {
            if let Some(start) = line.find('[') {
                if let Some(end) = line.find(']') {
                    result.resolved_ip = Some(line[start + 1..end].to_string());
                }
            }
        }

        // Parse individual replies
        if line.contains("Reply from") {
            seq += 1;
            let mut reply = PingReply {
                seq,
                ttl: None,
                time_ms: None,
                status: "Success".to_string(),
            };

            // Extract time
            if let Some(time_start) = line.find("time=") {
                let time_str = &line[time_start + 5..];
                if let Some(ms_end) = time_str.find("ms") {
                    if let Ok(time) = time_str[..ms_end].trim().parse::<f32>() {
                        reply.time_ms = Some(time);
                    }
                }
            } else if line.contains("time<1ms") {
                reply.time_ms = Some(0.5);
            }

            // Extract TTL
            if let Some(ttl_start) = line.find("TTL=") {
                let ttl_str = &line[ttl_start + 4..];
                if let Some(end) = ttl_str.find(|c: char| !c.is_ascii_digit()) {
                    if let Ok(ttl) = ttl_str[..end].parse::<u32>() {
                        reply.ttl = Some(ttl);
                    }
                } else if let Ok(ttl) = ttl_str.trim().parse::<u32>() {
                    reply.ttl = Some(ttl);
                }
            }

            result.replies.push(reply);
        } else if line.contains("Request timed out") {
            seq += 1;
            result.replies.push(PingReply {
                seq,
                ttl: None,
                time_ms: None,
                status: "Timeout".to_string(),
            });
        } else if line.contains("Destination host unreachable") {
            seq += 1;
            result.replies.push(PingReply {
                seq,
                ttl: None,
                time_ms: None,
                status: "Unreachable".to_string(),
            });
        }

        // Parse statistics
        if line.contains("Packets:") {
            // "Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)"
            if let Some(sent_start) = line.find("Sent = ") {
                let after_sent = &line[sent_start + 7..];
                if let Some(comma) = after_sent.find(',') {
                    if let Ok(sent) = after_sent[..comma].parse::<u32>() {
                        result.packets_sent = sent;
                    }
                }
            }
            if let Some(recv_start) = line.find("Received = ") {
                let after_recv = &line[recv_start + 11..];
                if let Some(comma) = after_recv.find(',') {
                    if let Ok(recv) = after_recv[..comma].parse::<u32>() {
                        result.packets_received = recv;
                    }
                }
            }
            if let Some(loss_start) = line.find('(') {
                if let Some(loss_end) = line.find('%') {
                    if let Ok(loss) = line[loss_start + 1..loss_end].parse::<f32>() {
                        result.packet_loss_percent = loss;
                    }
                }
            }
        }

        // Parse timing statistics
        if line.contains("Minimum = ") {
            // "Minimum = 1ms, Maximum = 10ms, Average = 5ms"
            if let Some(min_start) = line.find("Minimum = ") {
                let after_min = &line[min_start + 10..];
                if let Some(ms) = after_min.find("ms") {
                    if let Ok(min) = after_min[..ms].parse::<f32>() {
                        result.min_ms = Some(min);
                    }
                }
            }
            if let Some(max_start) = line.find("Maximum = ") {
                let after_max = &line[max_start + 10..];
                if let Some(ms) = after_max.find("ms") {
                    if let Ok(max) = after_max[..ms].parse::<f32>() {
                        result.max_ms = Some(max);
                    }
                }
            }
            if let Some(avg_start) = line.find("Average = ") {
                let after_avg = &line[avg_start + 10..];
                if let Some(ms) = after_avg.find("ms") {
                    if let Ok(avg) = after_avg[..ms].parse::<f32>() {
                        result.avg_ms = Some(avg);
                    }
                }
            }
        }
    }

    // Check for complete failure
    if output.contains("could not find host") || output.contains("Ping request could not find host")
    {
        result.error = Some("Could not resolve hostname".to_string());
    }

    result
}

/// Perform a traceroute to a host
#[tauri::command]
pub async fn trace_route(host: String) -> TracerouteResult {
    let output = match Command::new("tracert")
        .args(["-d", "-w", "1000", "-h", "30", &host])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return TracerouteResult {
                host,
                resolved_ip: None,
                hops: Vec::new(),
                completed: false,
                error: Some(format!("Failed to execute tracert: {}", e)),
            };
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_traceroute_output(&host, &stdout)
}

/// Parse Windows tracert output
fn parse_traceroute_output(host: &str, output: &str) -> TracerouteResult {
    let mut result = TracerouteResult {
        host: host.to_string(),
        resolved_ip: None,
        hops: Vec::new(),
        completed: false,
        error: None,
    };

    for line in output.lines() {
        // Extract target IP from header
        if line.contains("Tracing route to") {
            if let Some(start) = line.find('[') {
                if let Some(end) = line.find(']') {
                    result.resolved_ip = Some(line[start + 1..end].to_string());
                }
            }
        }

        // Parse hop lines (starts with hop number)
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Check if line starts with a number (hop number)
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        if let Ok(hop_num) = parts[0].parse::<u32>() {
            let mut hop = TracerouteHop {
                hop_number: hop_num,
                hostname: None,
                ip_address: None,
                rtt1_ms: None,
                rtt2_ms: None,
                rtt3_ms: None,
                timed_out: false,
            };

            // Check for timeout
            if trimmed.contains("Request timed out")
                || parts.iter().filter(|&&p| p == "*").count() >= 3
            {
                hop.timed_out = true;
            } else {
                // Parse RTT values and IP
                let mut rtt_idx = 0;
                for part in &parts[1..] {
                    if *part == "*" {
                        rtt_idx += 1;
                        continue;
                    }
                    if part.ends_with("ms") || *part == "ms" {
                        continue;
                    }
                    if let Ok(rtt) = part.trim_end_matches("ms").parse::<f32>() {
                        match rtt_idx {
                            0 => hop.rtt1_ms = Some(rtt),
                            1 => hop.rtt2_ms = Some(rtt),
                            2 => hop.rtt3_ms = Some(rtt),
                            _ => {}
                        }
                        rtt_idx += 1;
                    } else if part.contains('.') || part.contains(':') {
                        // Likely an IP address
                        hop.ip_address = Some(part.to_string());
                    }
                }
            }

            result.hops.push(hop);
        }

        // Check for completion
        if line.contains("Trace complete") {
            result.completed = true;
        }
    }

    // Check for errors
    if output.contains("Unable to resolve target") {
        result.error = Some("Unable to resolve hostname".to_string());
    }

    result
}

/// Perform DNS lookup
#[tauri::command]
pub async fn dns_lookup(domain: String, record_type: Option<String>) -> DnsLookupResult {
    let query_type = record_type.unwrap_or_else(|| "A".to_string());
    let start = std::time::Instant::now();

    let output = match Command::new("nslookup")
        .args(["-type=".to_owned() + &query_type, domain.clone()])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return DnsLookupResult {
                query: domain,
                query_type,
                answers: Vec::new(),
                response_time_ms: 0,
                server_used: None,
                error: Some(format!("Failed to execute nslookup: {}", e)),
            };
        }
    };

    let elapsed = start.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_nslookup_output(&domain, &query_type, &stdout, elapsed)
}

/// Parse nslookup output
fn parse_nslookup_output(
    domain: &str,
    query_type: &str,
    output: &str,
    elapsed: u64,
) -> DnsLookupResult {
    let mut result = DnsLookupResult {
        query: domain.to_string(),
        query_type: query_type.to_string(),
        answers: Vec::new(),
        response_time_ms: elapsed,
        server_used: None,
        error: None,
    };

    let mut in_answer_section = false;

    for line in output.lines() {
        let trimmed = line.trim();

        // Get DNS server used
        if trimmed.starts_with("Server:") {
            result.server_used = Some(trimmed[7..].trim().to_string());
        }

        // Check for non-authoritative answer section
        if trimmed.contains("Non-authoritative answer:") || trimmed.contains("Name:") {
            in_answer_section = true;
        }

        // Parse addresses
        if in_answer_section {
            if trimmed.starts_with("Address:") || trimmed.starts_with("Addresses:") {
                let addr_part = if trimmed.starts_with("Addresses:") {
                    &trimmed[10..]
                } else {
                    &trimmed[8..]
                };

                for addr in addr_part.split(',') {
                    let addr = addr.trim();
                    if !addr.is_empty() && !addr.contains('#') {
                        result.answers.push(DnsRecord {
                            record_type: if addr.contains(':') {
                                "AAAA".to_string()
                            } else {
                                "A".to_string()
                            },
                            value: addr.to_string(),
                            ttl: None,
                        });
                    }
                }
            }
        }
    }

    // Check for errors
    if output.contains("can't find") || output.contains("NXDOMAIN") {
        result.error = Some("Domain not found".to_string());
    } else if output.contains("timed out") {
        result.error = Some("DNS query timed out".to_string());
    }

    result
}

/// Get WiFi connection information
#[tauri::command]
pub async fn get_wifi_info() -> WifiInfo {
    let output = match Command::new("netsh")
        .args(["wlan", "show", "interfaces"])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            return WifiInfo {
                connected: false,
                ssid: None,
                bssid: None,
                signal_percent: None,
                channel: None,
                frequency_mhz: None,
                radio_type: None,
                authentication: None,
                receive_rate_mbps: None,
                transmit_rate_mbps: None,
                error: Some(format!("Failed to get WiFi info: {}", e)),
            };
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_wifi_output(&stdout)
}

/// Parse netsh wlan output
fn parse_wifi_output(output: &str) -> WifiInfo {
    let mut info = WifiInfo {
        connected: false,
        ssid: None,
        bssid: None,
        signal_percent: None,
        channel: None,
        frequency_mhz: None,
        radio_type: None,
        authentication: None,
        receive_rate_mbps: None,
        transmit_rate_mbps: None,
        error: None,
    };

    for line in output.lines() {
        let trimmed = line.trim();

        if let Some(idx) = trimmed.find(':') {
            let key = trimmed[..idx].trim().to_lowercase();
            let value = trimmed[idx + 1..].trim();

            match key.as_str() {
                "state" => {
                    info.connected = value.to_lowercase() == "connected";
                }
                "ssid" => {
                    info.ssid = Some(value.to_string());
                }
                "bssid" => {
                    info.bssid = Some(value.to_string());
                }
                "signal" => {
                    if let Ok(sig) = value.trim_end_matches('%').parse::<u32>() {
                        info.signal_percent = Some(sig);
                    }
                }
                "channel" => {
                    if let Ok(ch) = value.parse::<u32>() {
                        info.channel = Some(ch);
                    }
                }
                "radio type" => {
                    info.radio_type = Some(value.to_string());
                }
                "authentication" => {
                    info.authentication = Some(value.to_string());
                }
                "receive rate (mbps)" => {
                    if let Ok(rate) = value.parse::<f32>() {
                        info.receive_rate_mbps = Some(rate);
                    }
                }
                "transmit rate (mbps)" => {
                    if let Ok(rate) = value.parse::<f32>() {
                        info.transmit_rate_mbps = Some(rate);
                    }
                }
                _ => {}
            }
        }
    }

    // Estimate frequency from channel
    if let Some(channel) = info.channel {
        info.frequency_mhz = Some(if channel <= 14 {
            2412 + (channel - 1) * 5 // 2.4 GHz band
        } else if channel >= 36 {
            5180 + (channel - 36) * 5 // 5 GHz band
        } else {
            0
        });
    }

    // Check if no WiFi adapter
    if output.contains("no wireless interface") || output.contains("is not running") {
        info.error = Some("No wireless interface found".to_string());
    }

    info
}
