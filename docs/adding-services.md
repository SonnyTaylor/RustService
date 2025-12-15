# Adding New Services to RustService

This guide explains how to add a new service to the modular service automation system.

## Overview

Services are modular diagnostic/maintenance tasks that can be:
- Combined into presets (Diagnostics, General, Complete, Custom)
- Individually enabled/disabled by users
- Configured with custom options
- Run in sequence with live log output
- Have custom results renderers (for findings view and customer print)

## Architecture

The service system uses a modular architecture:

```
src-tauri/src/services/     # Backend: One file per service
├── mod.rs                  # Service trait & registry
├── ping_test.rs            # Ping test service
└── [new_service].rs        # Your new service

src/components/service-renderers/   # Frontend: Custom renderers
├── index.ts                        # Renderer registry
├── PingTestRenderer.tsx            # Ping test renderer
└── [NewService]Renderer.tsx        # Your new renderer
```

---

## Steps to Add a New Service

### 1. Create the Service File (Backend)

Create a new file in `src-tauri/src/services/`:

```rust
// src-tauri/src/services/my_service.rs

use std::time::Instant;
use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::services::Service;
use crate::types::{
    FindingSeverity, ServiceDefinition, ServiceFinding, ServiceOptionSchema, ServiceResult,
};

pub struct MyService;

impl Service for MyService {
    fn definition(&self) -> ServiceDefinition {
        ServiceDefinition {
            id: "my-service".to_string(),
            name: "My Service".to_string(),
            description: "What this service does".to_string(),
            category: "diagnostics".to_string(), // or "cleanup", "security", etc.
            estimated_duration_secs: 30,
            required_programs: vec![], // Add program IDs if external tools needed
            options: vec![
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
    }

    fn run(&self, options: &serde_json::Value, app: &AppHandle) -> ServiceResult {
        let start = Instant::now();
        let mut logs: Vec<String> = Vec::new();
        let mut findings: Vec<ServiceFinding> = Vec::new();
        let service_id = "my-service";

        // Emit log helper
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

        emit_log("Starting my service...", &mut logs, app);

        // Do the work here...

        // Add findings with optional data for custom renderer
        findings.push(ServiceFinding {
            severity: FindingSeverity::Success,
            title: "Result Title".to_string(),
            description: "Detailed description".to_string(),
            recommendation: None,
            data: Some(json!({
                "type": "my_finding_type",  // Used by custom renderer
                "value": 42
            })),
        });

        emit_log("Service complete", &mut logs, app);

        ServiceResult {
            service_id: service_id.to_string(),
            success: true,
            error: None,
            duration_ms: start.elapsed().as_millis() as u64,
            findings,
            logs,
        }
    }
}
```

### 2. Register the Service

Edit `src-tauri/src/services/mod.rs`:

```rust
mod my_service;  // Add module declaration

// In SERVICE_REGISTRY LazyLock:
static SERVICE_REGISTRY: LazyLock<HashMap<String, Box<dyn Service>>> = LazyLock::new(|| {
    let services: Vec<Box<dyn Service>> = vec![
        Box::new(ping_test::PingTestService),
        Box::new(my_service::MyService),  // Add your service
    ];
    // ...
});
```

### 3. Add to Presets (Optional)

In `src-tauri/src/services/mod.rs`, update `get_all_presets()`:

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
}
```

### 4. Add Icon to Frontend (if new)

Edit `src/pages/ServicePage.tsx`:

```tsx
import { MyIcon } from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  // existing icons...
  'my-icon': MyIcon,
};
```

---

## Adding a Custom Results Renderer (Optional)

For enhanced results display, create a custom renderer:

### 1. Create the Renderer

```tsx
// src/components/service-renderers/MyServiceRenderer.tsx

import type { ServiceRendererProps } from './index';

function FindingsRenderer({ result, definition }: ServiceRendererProps) {
  // Extract custom data from findings
  const finding = result.findings.find(
    (f) => (f.data as any)?.type === 'my_finding_type'
  );
  const data = finding?.data as { value: number } | undefined;

  return (
    <div className="p-4 rounded-lg bg-muted/50 border">
      <h3>{definition.name}</h3>
      {data && <p className="text-2xl font-bold">{data.value}</p>}
    </div>
  );
}

function CustomerRenderer({ result }: ServiceRendererProps) {
  // Simplified view for customer print
  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <p className="font-bold">{result.success ? '✓ Passed' : '✗ Failed'}</p>
    </div>
  );
}

export function MyServiceRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }
  return <FindingsRenderer {...props} />;
}
```

### 2. Register the Renderer

Edit `src/components/service-renderers/index.ts`:

```typescript
import { MyServiceRenderer } from './MyServiceRenderer';

export const SERVICE_RENDERERS: Partial<Record<string, ServiceRenderer>> = {
  'ping-test': PingTestRenderer,
  'my-service': MyServiceRenderer,  // Add your renderer
};
```

---

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

```rust
required_programs: vec!["bleachbit".to_string()],
```

## Testing

1. Run `pnpm tauri dev`
2. Navigate to Service tab
3. Select a preset that includes your service
4. Verify it appears in the queue
5. Run the service and check logs/findings
6. If you added a custom renderer, verify it displays correctly
