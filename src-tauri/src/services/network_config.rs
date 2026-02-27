//! Network Configuration Service
//!
//! Runs `ipconfig /all` and `netsh interface show interface` to gather
//! detailed network adapter configuration, DNS, DHCP, and gateway info.

use std::process::Command;
use std::time::Instant;

use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::services::Service;
use crate::types::{
    FindingSeverity, ServiceDefinition, ServiceFinding, ServiceOptionSchema, ServiceResult,
};

// =============================================================================
// Service Implementation
// =============================================================================

pub struct NetworkConfigService;

impl Service for NetworkConfigService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "network-config".to_string(),
            name: "Network Configuration".to_string(),
            description:
                "Analyze network adapters, DNS settings, DHCP configuration, and connectivity"
                    .to_string(),
            category: "diagnostics".to_string(),
            estimated_duration_secs: 8,
            required_programs: vec![], // Built-in Windows tools
            options: vec![ServiceOptionSchema {
                id: "include_disabled".to_string(),
                label: "Include Disabled Adapters".to_string(),
                option_type: "boolean".to_string(),
                default_value: json!(false),
                min: None,
                max: None,
                options: None,
                description: Some("Show disabled and disconnected network adapters".to_string()),
            }],
            icon: "globe".to_string(),
            exclusive_resources: vec![],
        }
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "network-config";

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

        let include_disabled = options
            .get("include_disabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        emit_log("Running network configuration analysis...", &mut logs, app);

        // Run ipconfig /all
        emit_log(
            "Gathering adapter details (ipconfig /all)...",
            &mut logs,
            app,
        );
        let ipconfig_output = match Command::new("ipconfig").arg("/all").output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                emit_log(
                    &format!(
                        "ipconfig exited with code: {}",
                        output.status.code().unwrap_or(-1)
                    ),
                    &mut logs,
                    app,
                );
                stdout
            }
            Err(e) => {
                emit_log(
                    &format!("ERROR: Failed to run ipconfig: {}", e),
                    &mut logs,
                    app,
                );
                String::new()
            }
        };

        // Run netsh to get adapter status
        emit_log(
            "Checking adapter status (netsh interface show interface)...",
            &mut logs,
            app,
        );
        let netsh_output = match Command::new("netsh")
            .args(["interface", "show", "interface"])
            .output()
        {
            Ok(output) => String::from_utf8_lossy(&output.stdout).to_string(),
            Err(e) => {
                emit_log(&format!("Warning: netsh failed: {}", e), &mut logs, app);
                String::new()
            }
        };

        // Also get DNS cache stats
        emit_log("Checking DNS configuration...", &mut logs, app);

        // Parse adapters from ipconfig
        let mut adapters = parse_ipconfig(&ipconfig_output);

        // Enrich with netsh status
        let netsh_statuses = parse_netsh_interfaces(&netsh_output);
        for adapter in &mut adapters {
            if let Some(status) = netsh_statuses.get(&adapter.name) {
                adapter.admin_state = status.admin_state.clone();
                adapter.interface_type = status.interface_type.clone();
            }
        }

        // Filter disabled if not requested
        if !include_disabled {
            adapters
                .retain(|a| a.admin_state != "Disabled" && !a.media_state.contains("disconnected"));
        }

        let total_adapters = adapters.len();
        let connected: Vec<&AdapterInfo> = adapters
            .iter()
            .filter(|a| !a.ipv4_address.is_empty())
            .collect();
        let has_ipv6: Vec<&AdapterInfo> = adapters
            .iter()
            .filter(|a| !a.ipv6_address.is_empty())
            .collect();

        emit_log(
            &format!(
                "Found {} adapters, {} connected, {} with IPv6",
                total_adapters,
                connected.len(),
                has_ipv6.len()
            ),
            &mut logs,
            app,
        );

        // Analyze DNS servers
        let mut dns_analysis = Vec::new();
        let known_public_dns = [
            ("8.8.8.8", "Google DNS"),
            ("8.8.4.4", "Google DNS"),
            ("1.1.1.1", "Cloudflare DNS"),
            ("1.0.0.1", "Cloudflare DNS"),
            ("9.9.9.9", "Quad9 DNS"),
            ("208.67.222.222", "OpenDNS"),
            ("208.67.220.220", "OpenDNS"),
        ];

        for adapter in &connected {
            for dns in &adapter.dns_servers {
                let provider = known_public_dns
                    .iter()
                    .find(|(ip, _)| ip == dns)
                    .map(|(_, name)| name.to_string())
                    .unwrap_or_else(|| {
                        if dns.starts_with("192.168.")
                            || dns.starts_with("10.")
                            || dns.starts_with("172.")
                        {
                            "Private/Router DNS".to_string()
                        } else {
                            "ISP/Unknown DNS".to_string()
                        }
                    });
                dns_analysis.push(json!({
                    "server": dns,
                    "provider": provider,
                    "adapter": adapter.name,
                }));
            }
        }

        // Build adapter data for renderer
        let adapter_data: Vec<serde_json::Value> = adapters
            .iter()
            .map(|a| {
                json!({
                    "name": a.name,
                    "description": a.description,
                    "type": a.interface_type,
                    "status": if a.media_state.contains("disconnected") { "Disconnected" } else if a.ipv4_address.is_empty() { "No IP" } else { "Connected" },
                    "ipv4": a.ipv4_address,
                    "ipv6": a.ipv6_address,
                    "subnetMask": a.subnet_mask,
                    "defaultGateway": a.default_gateway,
                    "dnsServers": a.dns_servers,
                    "dhcpEnabled": a.dhcp_enabled,
                    "dhcpServer": a.dhcp_server,
                    "macAddress": a.mac_address,
                    "adminState": a.admin_state,
                })
            })
            .collect();

        // Determine overall severity
        let severity = if connected.is_empty() {
            FindingSeverity::Error
        } else {
            FindingSeverity::Success
        };

        let title = if connected.is_empty() {
            "No Connected Network Adapters".to_string()
        } else {
            format!("{} adapter(s) connected", connected.len())
        };

        let description = format!(
            "{} total adapter(s), {} connected. {}",
            total_adapters,
            connected.len(),
            if !dns_analysis.is_empty() {
                format!(
                    "DNS: {}",
                    dns_analysis
                        .iter()
                        .filter_map(|d| d.get("provider").and_then(|p| p.as_str()))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            } else {
                "No DNS configured.".to_string()
            }
        );

        findings.push(ServiceFinding {
            severity,
            title,
            description,
            recommendation: if connected.is_empty() {
                Some("Check physical network connections and adapter settings.".to_string())
            } else {
                None
            },
            data: Some(json!({
                "type": "network_config",
                "totalAdapters": total_adapters,
                "connectedAdapters": connected.len(),
                "ipv6Adapters": has_ipv6.len(),
                "adapters": adapter_data,
                "dnsAnalysis": dns_analysis,
                "includeDisabled": include_disabled,
            })),
        });

        // Flag interesting DNS configurations
        let uses_isp_dns = dns_analysis.iter().any(|d| {
            d.get("provider")
                .and_then(|p| p.as_str())
                .map(|p| p.contains("ISP") || p.contains("Unknown"))
                .unwrap_or(false)
        });

        if uses_isp_dns && !connected.is_empty() {
            findings.push(ServiceFinding {
                severity: FindingSeverity::Info,
                title: "Using ISP DNS Servers".to_string(),
                description:
                    "One or more adapters are using ISP-provided DNS servers. Public DNS (Cloudflare 1.1.1.1 or Google 8.8.8.8) may offer better performance and privacy."
                        .to_string(),
                recommendation: Some(
                    "Consider switching to a public DNS provider for better speed and privacy."
                        .to_string(),
                ),
                data: None,
            });
        }

        emit_log("Network configuration analysis complete.", &mut logs, app);

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

// =============================================================================
// Parsers
// =============================================================================

struct AdapterInfo {
    name: String,
    description: String,
    mac_address: String,
    dhcp_enabled: bool,
    dhcp_server: String,
    ipv4_address: String,
    ipv6_address: String,
    subnet_mask: String,
    default_gateway: String,
    dns_servers: Vec<String>,
    media_state: String,
    admin_state: String,
    interface_type: String,
}

struct NetshInterface {
    admin_state: String,
    interface_type: String,
}

fn parse_ipconfig(text: &str) -> Vec<AdapterInfo> {
    let mut adapters = Vec::new();
    let mut current: Option<AdapterInfo> = None;
    let mut collecting_dns = false;

    for line in text.lines() {
        let trimmed = line.trim();

        // New adapter section (not indented, ends with ':')
        if !line.starts_with(' ')
            && !line.starts_with('\t')
            && line.contains("adapter")
            && line.ends_with(':')
        {
            // Save previous
            if let Some(adapter) = current.take() {
                adapters.push(adapter);
            }
            collecting_dns = false;
            let name = line
                .trim_end_matches(':')
                .split("adapter ")
                .last()
                .unwrap_or("")
                .trim()
                .to_string();
            current = Some(AdapterInfo {
                name,
                description: String::new(),
                mac_address: String::new(),
                dhcp_enabled: false,
                dhcp_server: String::new(),
                ipv4_address: String::new(),
                ipv6_address: String::new(),
                subnet_mask: String::new(),
                default_gateway: String::new(),
                dns_servers: Vec::new(),
                media_state: String::new(),
                admin_state: "Enabled".to_string(),
                interface_type: String::new(),
            });
            continue;
        }

        if let Some(ref mut adapter) = current {
            if trimmed.starts_with("Media State") || trimmed.starts_with("Media state") {
                if let Some(val) = extract_value(trimmed) {
                    adapter.media_state = val;
                }
                collecting_dns = false;
            } else if trimmed.starts_with("Description") {
                if let Some(val) = extract_value(trimmed) {
                    adapter.description = val;
                }
                collecting_dns = false;
            } else if trimmed.starts_with("Physical Address") {
                if let Some(val) = extract_value(trimmed) {
                    adapter.mac_address = val;
                }
                collecting_dns = false;
            } else if trimmed.starts_with("DHCP Enabled") {
                if let Some(val) = extract_value(trimmed) {
                    adapter.dhcp_enabled = val.to_lowercase() == "yes";
                }
                collecting_dns = false;
            } else if trimmed.starts_with("DHCP Server") {
                if let Some(val) = extract_value(trimmed) {
                    adapter.dhcp_server = val;
                }
                collecting_dns = false;
            } else if trimmed.starts_with("IPv4 Address")
                || trimmed.starts_with("Autoconfiguration IPv4")
            {
                if let Some(val) = extract_value(trimmed) {
                    adapter.ipv4_address = val.trim_end_matches("(Preferred)").trim().to_string();
                }
                collecting_dns = false;
            } else if trimmed.starts_with("IPv6 Address")
                || trimmed.starts_with("Link-local IPv6")
                || trimmed.starts_with("Temporary IPv6")
            {
                if adapter.ipv6_address.is_empty() {
                    if let Some(val) = extract_value(trimmed) {
                        adapter.ipv6_address =
                            val.trim_end_matches("(Preferred)").trim().to_string();
                    }
                }
                collecting_dns = false;
            } else if trimmed.starts_with("Subnet Mask") {
                if let Some(val) = extract_value(trimmed) {
                    adapter.subnet_mask = val;
                }
                collecting_dns = false;
            } else if trimmed.starts_with("Default Gateway") {
                if let Some(val) = extract_value(trimmed) {
                    adapter.default_gateway = val;
                }
                collecting_dns = false;
            } else if trimmed.starts_with("DNS Servers") {
                if let Some(val) = extract_value(trimmed) {
                    if !val.is_empty() {
                        adapter.dns_servers.push(val);
                    }
                }
                collecting_dns = true;
            } else if collecting_dns && !trimmed.is_empty() && !trimmed.contains(". . .") {
                // Continuation of DNS servers (indented IPs)
                let potential_ip = trimmed.to_string();
                if looks_like_ip(&potential_ip) {
                    adapter.dns_servers.push(potential_ip);
                } else {
                    collecting_dns = false;
                }
            } else if trimmed.contains(". . .") {
                collecting_dns = false;
            }
        }
    }

    // Save last adapter
    if let Some(adapter) = current {
        adapters.push(adapter);
    }

    adapters
}

fn parse_netsh_interfaces(text: &str) -> std::collections::HashMap<String, NetshInterface> {
    let mut map = std::collections::HashMap::new();

    for line in text.lines().skip(3) {
        // Skip header lines
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            continue;
        }

        // Format: "Admin State    State          Type             Interface Name"
        // Example: "Enabled        Connected      Dedicated        Wi-Fi"
        let parts: Vec<&str> = trimmed.splitn(4, char::is_whitespace).collect();
        if parts.len() >= 4 {
            // More robust parsing — split on multiple spaces
            let columns: Vec<String> = trimmed.split_whitespace().map(|s| s.to_string()).collect();
            if columns.len() >= 4 {
                let admin_state = columns[0].clone();
                let interface_type = columns[2].clone();
                // Name is everything after the third column
                let name = columns[3..].join(" ");
                map.insert(
                    name,
                    NetshInterface {
                        admin_state,
                        interface_type,
                    },
                );
            }
        }
    }

    map
}

fn extract_value(line: &str) -> Option<String> {
    // "Key . . . . . . : Value" → "Value"
    line.split(':').nth(1).map(|v| v.trim().to_string())
}

fn looks_like_ip(s: &str) -> bool {
    let trimmed = s.trim();
    // Simple check: contains dots or colons and no spaces
    !trimmed.contains(' ') && (trimmed.contains('.') || trimmed.contains(':')) && trimmed.len() >= 3
}
