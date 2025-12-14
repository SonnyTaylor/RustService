# Adding New Services to RustService

This guide explains how to add a new service to the modular service automation system.

## Overview

Services are modular diagnostic/maintenance tasks that can be:
- Combined into presets (Diagnostics, General, Complete, Custom)
- Individually enabled/disabled by users
- Configured with custom options
- Run in sequence with live log output

## Steps to Add a New Service

### 1. Define the Service in Rust

Edit `src-tauri/src/commands/services.rs`:

```rust
// In get_all_service_definitions(), add a new ServiceDefinition:
ServiceDefinition {
    id: "my-service".to_string(),
    name: "My Service".to_string(),
    description: "What this service does".to_string(),
    category: "diagnostics".to_string(), // or "cleanup", "security", etc.
    estimated_duration_secs: 30,
    required_programs: vec![], // Add program IDs if external tools needed
    options: vec![
        // Add configurable options
        ServiceOptionSchema {
            id: "option_name".to_string(),
            label: "Option Label".to_string(),
            option_type: "number".to_string(), // or "string", "boolean", "select"
            default_value: json!(10),
            min: Some(1.0),
            max: Some(100.0),
            options: None,
            description: Some("Help text".to_string()),
        },
    ],
    icon: "icon-name".to_string(), // lucide icon name
}
```

### 2. Implement the Service Logic

In the `run_service()` function, add a match arm:

```rust
"my-service" => {
    // Get options
    let option_value = options
        .get("option_name")
        .and_then(|v| v.as_u64())
        .unwrap_or(10);

    emit_log("Starting my service...", &mut logs, app);

    // Do the work
    // ...

    // Add findings
    findings.push(ServiceFinding {
        severity: FindingSeverity::Success, // or Info, Warning, Error, Critical
        title: "Result Title".to_string(),
        description: "Detailed description".to_string(),
        recommendation: None, // or Some("Action to take".to_string())
        data: None, // or Some(json!({...}))
    });

    emit_log("Service complete", &mut logs, app);
}
```

### 3. Add to Presets (Optional)

If your service should be included in presets, add it to `get_all_presets()`:

```rust
ServicePreset {
    id: "diagnostics".to_string(),
    // ...
    services: vec![
        // existing services...
        PresetServiceConfig {
            service_id: "my-service".to_string(),
            enabled: true,
            options: json!({"option_name": 10}),
        },
    ],
    // ...
}
```

### 4. Add Icon to Frontend

If using a new icon, add it to `ICON_MAP` in `ServicePage.tsx`:

```tsx
import { MyIcon } from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  // existing icons...
  'my-icon': MyIcon,
};
```

### 5. Test

1. Run `pnpm tauri dev`
2. Navigate to Service tab
3. Select a preset that includes your service
4. Verify it appears in the queue
5. Run the service and check logs/findings

## Service Categories

| Category | Description |
|----------|-------------|
| `diagnostics` | System health checks, tests |
| `cleanup` | Junk file removal, optimization |
| `security` | Malware/adware scanning |
| `maintenance` | Updates, repairs |

## Finding Severities

| Severity | Use For |
|----------|---------|
| `Info` | Neutral information |
| `Success` | Passed checks, good results |
| `Warning` | Minor issues, recommendations |
| `Error` | Problems that need attention |
| `Critical` | Severe issues requiring immediate action |

## External Program Dependencies

If your service requires an external program:

1. Add the program ID to `required_programs` in your service definition
2. Users must add the program via the Programs page
3. The system validates requirements before allowing the service to run

Example for a service using `bleachbit`:

```rust
required_programs: vec!["bleachbit".to_string()],
```

## Example: Disk Space Service

```rust
ServiceDefinition {
    id: "disk-space".to_string(),
    name: "Disk Space Report".to_string(),
    description: "Analyzes disk usage and free space".to_string(),
    category: "diagnostics".to_string(),
    estimated_duration_secs: 5,
    required_programs: vec![],
    options: vec![],
    icon: "hard-drive".to_string(),
}

// In run_service():
"disk-space" => {
    emit_log("Analyzing disk space...", &mut logs, app);
    
    // Use sysinfo crate to get disk info
    let mut sys = sysinfo::System::new();
    let disks = sysinfo::Disks::new_with_refreshed_list();
    
    for disk in disks.list() {
        let total = disk.total_space();
        let free = disk.available_space();
        let used_percent = ((total - free) as f64 / total as f64 * 100.0) as u32;
        
        let severity = if used_percent > 90 {
            FindingSeverity::Critical
        } else if used_percent > 75 {
            FindingSeverity::Warning
        } else {
            FindingSeverity::Success
        };
        
        findings.push(ServiceFinding {
            severity,
            title: format!("Drive {}: {}% used", disk.mount_point().display(), used_percent),
            description: format!(
                "{:.1} GB free of {:.1} GB",
                free as f64 / 1_073_741_824.0,
                total as f64 / 1_073_741_824.0
            ),
            recommendation: if used_percent > 75 {
                Some("Consider freeing up disk space".to_string())
            } else {
                None
            },
            data: Some(json!({
                "drive": disk.mount_point().to_string_lossy(),
                "total": total,
                "free": free,
                "usedPercent": used_percent
            })),
        });
    }
}
```
