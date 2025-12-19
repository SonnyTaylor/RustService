# AGENTS.md - RustService

Agent-focused development context for RustService, a Tauri + React Windows desktop toolkit.

## Project Overview

- **Stack**: Tauri 2.0 (Rust backend) + Vite + React + TypeScript + TailwindCSS v4 + shadcn/ui
- **Target Platform**: Windows 10/11 only
- **Purpose**: Portable desktop toolkit for computer repair technicians

## Dev Environment

### Prerequisites
- Windows 10/11
- Node.js + pnpm
- Rust toolchain (https://rustup.rs/)

### Quick Start
```bash
pnpm install          # Install frontend dependencies
pnpm tauri dev        # Run in development mode (requires admin for some features)
pnpm tauri build      # Build portable executable
```

### Project Structure
```
src/                    # Frontend (React + TypeScript)
├── components/         # Reusable components
│   ├── ui/            # shadcn components (DO NOT manually edit)
│   ├── theme-provider.tsx
│   ├── theme-toggle.tsx
│   └── titlebar.tsx
├── pages/             # Tab page components
├── types/             # TypeScript type definitions
├── styles/globals.css # Theme variables + custom CSS
├── App.tsx            # Main app with tab navigation
└── main.tsx           # Entry point

src-tauri/             # Backend (Rust)
├── src/lib.rs         # Tauri commands and business logic
├── capabilities/      # Tauri permissions
├── tauri.conf.json    # Window config, build settings
└── data/              # Runtime data folder (created at startup)
```

## Conventions

### Adding shadcn Components
Always use the CLI, never manually create shadcn components:
```bash
pnpm dlx shadcn@latest add <component-name>
```
Components are configured with `new-york` style and TailwindCSS v4.

### Creating New Pages
1. Create `src/pages/NewPage.tsx` following existing patterns
2. Export from `src/pages/index.ts`
3. Add to `TABS` array in `src/App.tsx`

### Adding Tauri Commands
1. Add command function in `src-tauri/src/lib.rs` with `#[tauri::command]`
2. Register in `invoke_handler` in the `run()` function
3. Add any required permissions to `src-tauri/capabilities/default.json`
4. Call from frontend with `invoke('command_name', { args })`

### TypeScript Types
- Define shared types in `src/types/`
- Re-export from `src/types/index.ts`
- Types should match Rust struct definitions for IPC

### CSS & Theming
- Use TailwindCSS utility classes wherever possible
- Theme variables defined in `src/styles/globals.css` using oklch colors
- Custom CSS goes in `globals.css` after the `@layer base` block
- Support both light and dark modes via `.dark` class

## Data Folder

The `data/` folder is created at runtime alongside the executable:
- **Development**: `src-tauri/data/`
- **Production**: Next to the `.exe` file

Structure:
```
data/
├── programs/      # Portable tools
├── logs/          # Application logs
├── reports/       # Generated reports
├── scripts/       # User scripts
└── settings.json  # User preferences (theme, etc.)
```

## Testing

### Manual Testing
Run `pnpm tauri dev` and verify:
1. All 8 tabs render properly
2. Theme switching works (in Settings page)
3. Data folder is created with subdirectories
4. Window controls (minimize, maximize, close) function
5. Window can be dragged by titlebar

### Build Verification
```bash
pnpm tauri build
# Outputs to: src-tauri/target/release/rustservice.exe
```

## Common Tasks

### Add a new service/tool
1. Define tool metadata type in `src/types/`
2. Add Rust command in `lib.rs` for execution
3. Create UI in `ServicePage.tsx`

### Add settings option
1. Add field to appropriate Rust struct in `src-tauri/src/types/settings.rs`
   - `AppearanceSettings` for visual settings
   - `DataSettings` for storage/logging settings  
   - `ApplicationSettings` for app behavior
2. Add corresponding TypeScript field in `src/types/settings.ts`
3. Add key to `SettingKey` union type in `src/types/settings.ts`
4. Add match arm in `update_setting()` in `src-tauri/src/commands/settings.rs`
5. Add UI control in appropriate panel in `SettingsPage.tsx`

### Update window config
Edit `src-tauri/tauri.conf.json` - requires dev server restart

## Settings System

### Architecture
- **Storage**: JSON file at `data/settings.json` (human-readable, USB-portable)
- **Backend**: Rust types in `src-tauri/src/types/settings.rs`
- **Frontend Access**: React Context via `useSettings()` hook
- **Theme/Color**: `useTheme()` hook for theme mode + color scheme
- **Categories**: Appearance, Data, Application

### Using Settings from Any Component
```tsx
import { useSettings } from '@/components/settings-context';

function MyComponent() {
  const { settings, updateSetting, isLoading } = useSettings();
  
  // Read a setting
  const theme = settings.appearance.theme;
  
  // Update a setting
  await updateSetting('appearance.theme', 'dark');
}
```

### Using Theme/Color Scheme
```tsx
import { useTheme } from '@/components/theme-provider';

function MyComponent() {
  const { themeMode, colorScheme, setThemeMode, setColorScheme } = useTheme();
  
  // Change to dark mode
  setThemeMode('dark');
  
  // Change color scheme
  setColorScheme('techbay');
}
```

### Adding a New Color Scheme (TweakCN)
1. Add theme CSS to `src/styles/globals.css`:
   ```css
   .theme-mytheme { /* light mode vars */ }
   .theme-mytheme.dark { /* dark mode vars */ }
   ```
2. Add to `COLOR_SCHEMES` array in `src/types/settings.ts`:
   ```ts
   { id: 'mytheme', name: 'My Theme', description: '...', preview: {...} }
   ```
3. Add to `ColorScheme` type union in `src/types/settings.ts`

### Settings File Format
```json
{
  "version": "0.3.0",
  "appearance": { "theme": "system", "colorScheme": "techbay", "accentColor": "#3b82f6" },
  "data": { "autoBackup": false, "logLevel": "info" },
  "application": { "startMinimized": false, "checkUpdates": true, "confirmOnExit": false }
}
```


## Known Lint Warnings

These CSS warnings are **expected** and can be ignored:
- `Unknown at rule @custom-variant` - TailwindCSS v4 syntax
- `Unknown at rule @theme` - TailwindCSS v4 syntax  
- `Unknown at rule @apply` - TailwindCSS directive
- `Unknown property: 'app-region'` - Windows-specific CSS for titlebar dragging

## System Info (sysinfo crate)

The System Info page uses the `sysinfo` Rust crate (v0.37+) for hardware/OS data collection.

### Key Patterns
- Keep a single `System` instance and call `refresh_*()` methods
- Use `System::new_all()` for initial load, specific refresh methods for updates
- CPU usage requires two measurements with `MINIMUM_CPU_UPDATE_INTERVAL` between them
- All structs use `#[serde(rename_all = "camelCase")]` for JS interop

### Adding New System Info
1. Add fields to Rust struct in `lib.rs` (e.g., `NetworkInfo`)
2. Mirror in TypeScript type in `src/types/system-info.ts`
3. Collect data in `get_system_info()` command
4. Add UI card in `SystemInfoPage.tsx`

### Available sysinfo Data
| Type | Data Available |
|------|----------------|
| `System` | Memory, swap, CPUs, processes, uptime |
| `Disks` | Name, mount, space, filesystem, type |
| `Networks` | Interface name, MAC, TX/RX bytes |
| `Components` | Temperature sensors |
| `Motherboard` | Vendor, model, serial |

### GPU Info (gfxinfo crate)
Uses `gfxinfo::active_gpu()` to get graphics card info:
- Vendor, model, family, device ID
- VRAM total/used, load %, temperature

### Battery Info (battery crate)
Uses `battery::Manager` to enumerate batteries:
- State of charge, energy, power rate
- Health, cycles, temperature
- Time to full/empty estimates

## Programs System

Portable programs launcher for managing and running tools from the data folder.

### Data Storage
- **Config**: `data/programs.json` - List of all programs with metadata
- **Icons**: `data/programs/icons/` - Extracted/custom program icons (PNG)

### Tauri Commands
| Command | Description |
|---------|-------------|
| `get_programs` | Get all programs |
| `add_program` | Add new program with auto icon extraction |
| `update_program` | Update program details |
| `delete_program` | Remove program |
| `launch_program` | Launch via tauri-plugin-opener |
| `extract_program_icon` | Extract icon from .exe (Windows API) |
| `reveal_program` | Show in file explorer |

### Icon Extraction
Uses Windows `ExtractIconExW` API via `winapi` crate. Extracts first large icon from exe and saves as PNG using `image` crate.

### Frontend Usage
```tsx
import { invoke } from '@tauri-apps/api/core';

// Get all programs
const programs = await invoke<Program[]>('get_programs');

// Launch a program (increments launch count)
await invoke('launch_program', { id: programId });
```

## Required Programs System

Auto-detection system for external programs required by services (e.g., BleachBit, AdwCleaner).

### Architecture
- **Registry**: Static list of known required programs in `src-tauri/src/commands/required_programs.rs`
- **Auto-detection**: Searches `data/programs/` recursively for matching exe names
- **Overrides**: Users can set custom paths in **Settings → Programs**
- **Validation**: Services check requirements before execution

### Key Files
| File | Purpose |
|------|---------|
| `src-tauri/src/commands/required_programs.rs` | Registry + detection commands |
| `src-tauri/src/types/required_program.rs` | Rust type definitions |
| `src/types/required-programs.ts` | TypeScript type definitions |
| `src/pages/SettingsPage.tsx` | ProgramsPanel UI in Settings |

### Tauri Commands
| Command | Description |
|---------|-------------|
| `get_required_programs_status` | Get all programs with found/missing status |
| `get_program_exe_path` | Get resolved path for a program ID |
| `set_program_path_override` | Set/clear custom path override |
| `validate_required_programs` | Check if program IDs are available |

### Adding a Required Program
1. Add `RequiredProgramDef` to `REQUIRED_PROGRAMS` in `required_programs.rs`:
   ```rust
   RequiredProgramDef {
       id: "program-id".to_string(),
       name: "Display Name".to_string(),
       description: "What it does".to_string(),
       exe_names: vec!["program.exe".to_string()],
       url: Some("https://download-link.com/".to_string()),
   }
   ```
2. Reference the ID in service's `required_programs` vector
3. Use `get_program_exe_path("program-id")` to get the resolved path

## Service System

Modular service automation with 4-step flow: **Presets → Queue → Runner → Results**.

### Architecture
- **Presets**: Pre-configured service bundles (Diagnostics, General, Complete, Custom)
- **Queue**: Drag-and-drop reordering, enable/disable, configure options
- **Runner**: Executes services sequentially with real-time log streaming
- **Results**: 3 tabs - Findings (detailed), Printout (technical), Customer Print (simplified)

### Key Files
| File | Purpose |
|------|---------|
| `src-tauri/src/types/service.rs` | Rust type definitions |
| `src-tauri/src/commands/services.rs` | Service runner + implementations |
| `src/types/service.ts` | TypeScript type definitions |
| `src/pages/ServicePage.tsx` | 4-view frontend component |
| `docs/adding-services.md` | Guide for adding new services |

### Adding a New Service
1. Add `ServiceDefinition` to `get_all_service_definitions()` in `services.rs`
2. Implement service logic in `run_service()` match arm
3. Optionally add to presets in `get_all_presets()`
4. Add icon to `ICON_MAP` in `ServicePage.tsx` if needed

See `docs/adding-services.md` for detailed instructions.

### Tauri Commands
| Command | Description |
|---------|-------------|
| `get_service_definitions` | List all available services |
| `get_service_presets` | Get preset configurations |
| `validate_service_requirements` | Check if programs installed |
| `get_service_run_state` | Get current run state (persists across tabs) |
| `run_services` | Execute service queue |
| `cancel_service_run` | Cancel running services |
| `get_service_report` | Get saved report by ID |
| `list_service_reports` | List all saved reports |

### Data Storage
- **Reports**: `data/reports/*.json` - Saved service run reports

## Animation System

Framer Motion integration with a user-togglable setting for smooth UI animations.

### Architecture
- **Setting**: `appearance.enableAnimations` (boolean, default: true)
- **Context**: `AnimationProvider` wraps the app and respects the setting
- **Presets**: Reusable animation configs in `animation-context.tsx`

### Using Animations

```tsx
import { useAnimation, motion, AnimatedList, AnimatedItem } from '@/components/animation-context';

function MyComponent() {
  const { animationsEnabled, fadeInUp } = useAnimation();
  
  // Use preset motion props
  return (
    <motion.div {...fadeInUp}>
      <Card>Content</Card>
    </motion.div>
  );
}

// Or use convenience components for staggered lists
function MyList() {
  return (
    <AnimatedList className="grid gap-4">
      {items.map(item => (
        <AnimatedItem key={item.id}>
          <Card>{item.name}</Card>
        </AnimatedItem>
      ))}
    </AnimatedList>
  );
}
```

### Available Presets
| Preset | Description |
|--------|-------------|
| `fadeIn` | Fade from transparent |
| `fadeInUp` | Fade + slide up |
| `fadeInScale` | Fade + scale up |
| `slideInLeft/Right` | Slide from side |
| `staggerContainer` | Container for staggered children |
| `staggerItem` | Child item for stagger |
| `hoverScale` | Scale on hover |
| `hoverLift` | Lift on hover |

### Adding the Setting Toggle
The toggle is in Settings → Appearance → Animations. When disabled, all `motion.div` elements render as plain `div` elements with no transitions.

## Agent System

AI-powered assistant with command execution, memory, and web search. Human-in-the-loop design ensures user control over all system modifications.

### Architecture
- **Frontend**: React chat UI + Vercel AI SDK (`@ai-sdk/react`, `ai`)
- **Backend**: Rust commands in `src-tauri/src/commands/agent.rs`
- **Storage**: SQLite database at `data/agent.db`
- **Settings**: `data/settings.json` under `agent` key

### Key Files
| File | Purpose |
|------|---------|
| `src/pages/AgentPage.tsx` | Main chat interface |
| `src/components/agent/ChatMessage.tsx` | Message display with tool calls |
| `src/components/agent/CommandApproval.tsx` | Pending command approval UI |
| `src/components/agent/MemoryBrowser.tsx` | Memory viewing/search |
| `src/lib/agent-tools.ts` | Vercel AI SDK tool definitions |
| `src/types/agent.ts` | TypeScript types |
| `src-tauri/src/commands/agent.rs` | Rust backend commands |
| `src-tauri/src/types/agent.rs` | Rust types |
| `docs/agent-system.md` | Full documentation |

### ⚠️ Critical: Tauri Parameter Naming

**Tauri does NOT auto-convert between camelCase and snake_case.**

When calling Tauri commands from TypeScript, **use snake_case** parameter names:

```typescript
// ❌ WRONG - will fail
await invoke('approve_command', { commandId: id });

// ✅ CORRECT - matches Rust parameter name
await invoke('approve_command', { command_id: id });
```

### Tauri Commands
| Command | Parameters (snake_case!) | Description |
|---------|--------------------------|-------------|
| `queue_agent_command` | `command`, `reason` | Queue command for approval |
| `approve_command` | `command_id` | Approve and execute |
| `reject_command` | `command_id` | Reject command |
| `save_memory` | `memory_type`, `content`, `metadata?` | Save to memory |
| `search_memories` | `query`, `memory_type?`, `limit?` | Search memories |
| `get_all_memories` | `memory_type?`, `limit?` | Get all memories |
| `delete_memory` | `memory_id` | Delete a memory |
| `search_tavily` | `query`, `api_key` | Web search via Tavily |
| `search_searxng` | `query`, `instance_url` | Web search via SearXNG |
| `get_command_history` | `limit?` | Get executed commands |
| `list_agent_programs` | - | List tools in data/programs/ |

### Command Approval Modes
| Mode | Behavior |
|------|----------|
| `always` | All commands require approval (default, safest) |
| `whitelist` | Whitelisted patterns auto-execute, others need approval |
| `yolo` | All commands auto-execute (⚠️ dangerous) |

### Memory Types
| Type | Purpose |
|------|---------|
| `fact` | User-provided information |
| `solution` | Successful past solutions |
| `conversation` | Chat context fragments |
| `instruction` | Behavioral rules |

### Adding an Agent Tool
1. Add Rust command in `src-tauri/src/commands/agent.rs`
2. Register in `src-tauri/src/lib.rs` invoke_handler
3. Create Vercel AI SDK tool in `src/lib/agent-tools.ts`
4. Add to tools array in `AgentPage.tsx`

See `docs/agent-system.md` for complete documentation.

## MCP Server (Remote Control)

Model Context Protocol (MCP) server for remote LLM control. Allows external AI systems (Agent Zero, Claude Desktop, etc.) to control this machine via HTTP.

### Architecture
- **HTTP Server**: Runs on configurable port (default: 8377)
- **Authentication**: Bearer token in Authorization header
- **Backend**: Rust module at `src-tauri/src/mcp/`
- **Settings**: `mcpServerEnabled`, `mcpApiKey`, `mcpPort` in AgentSettings

### Key Files
| File | Purpose |
|------|---------|
| `src-tauri/src/mcp/mod.rs` | Module exports |
| `src-tauri/src/mcp/server.rs` | HTTP server with bearer auth |
| `src-tauri/src/mcp/tools.rs` | MCP tool definitions |
| `src/pages/SettingsPage.tsx` | MCP settings UI in Agent panel |

### Available Tools
| Tool | Description |
|------|-------------|
| `execute_command` | Run PowerShell commands |
| `read_file` | Read file contents |
| `write_file` | Write to files |
| `list_dir` | List directory contents |
| `move_file` | Move/rename files |
| `copy_file` | Copy files |
| `get_system_info` | Get system information |
| `search_web` | Web search (Tavily/SearXNG) |

### Endpoints
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/` | GET | No | Health check |
| `/health` | GET | No | Health check |
| `/mcp` | POST | Yes | MCP JSON-RPC endpoint |

### Quick Start
1. Enable in Settings → AI Agent → MCP Server
2. Copy the auto-generated API key
3. Restart the app
4. Connect via: `POST http://localhost:8377/mcp` with `Authorization: Bearer <key>`

### Testing
```bash
# Health check
curl http://localhost:8377/

# MCP endpoint
curl -X POST \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:8377/mcp
```

### Security
- Always use a strong API key
- For remote access, use HTTPS via a reverse proxy
- Commands execute based on approval mode settings
- Requires app restart after configuration changes

## Dependencies to Know

| Package | Purpose |
|---------|-------------|
| `@tauri-apps/api` | Frontend-to-Rust IPC |
| `@tauri-apps/plugin-dialog` | File picker dialogs |
| `@tauri-apps/plugin-opener` | Open files/URLs, reveal in explorer |
| `@dnd-kit/core` | Drag-and-drop for service queue |
| `framer-motion` | Animations and transitions |
| `lucide-react` | Icon library |
| `class-variance-authority` | Component variants (shadcn) |
| `tailwind-merge` | Merge Tailwind classes (shadcn) |
| `ai` | Vercel AI SDK core |
| `@ai-sdk/react` | React hooks for AI SDK |
| `@ai-sdk/openai` | OpenAI provider for AI SDK |
| `@ai-sdk/anthropic` | Anthropic provider for AI SDK |
| `zod` | Schema validation for AI tools |
| `sysinfo` | System hardware/OS info (Rust) |
| `gfxinfo` | GPU information (Rust) |
| `battery` | Battery status (Rust) |
| `uuid` | Unique IDs for programs (Rust) |
| `chrono` | Timestamps (Rust) |
| `image` | Icon conversion (Rust) |
| `winapi` | Windows icon extraction (Rust) |
| `rusqlite` | SQLite database for agent memory (Rust) |
| `urlencoding` | URL encoding for search queries (Rust) |
| `rmcp` | Rust MCP SDK for protocol implementation (Rust) |
| `hyper` | HTTP server for MCP (Rust) |
| `hyper-util` | HTTP utilities (Rust) |
| `http-body-util` | HTTP body utilities (Rust) |

