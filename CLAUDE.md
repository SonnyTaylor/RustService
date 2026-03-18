# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RustService is a portable Windows desktop toolkit for computer repair technicians. Built with **Tauri 2.0** (Rust backend + React frontend), targeting Windows 10/11 only.

## Commands

```bash
bun install           # Install frontend dependencies
bun tauri dev         # Run in dev mode (some features require admin)
bun tauri build       # Build executable → src-tauri/target/release/rustservice.exe
```

There are no automated tests — verification is manual (run `pnpm tauri dev` and exercise the UI).

### Adding shadcn Components
Always use the CLI, never create them manually:
```bash
bunx shadcn@latest add <component-name>
```
Components use `new-york` style with TailwindCSS v4. Do NOT manually edit files in `src/components/ui/`.

## Architecture

### Frontend (`src/`)
- **`App.tsx`** — Tab-based navigation. Primary tabs hardcoded in `TABS` array; secondary tabs in "More" dropdown; dynamic technician tabs support URLs/iframes.
- **`pages/`** — One component per tab (Agent, Service, SystemInfo, Programs, Scripts, NetworkDiagnostics, StartupManager, EventLog, Bluescreen, Reports, ComponentTest, Shortcuts, Settings).
- **`components/`** — Shared components. Key ones: `settings-context.tsx` (React context), `theme-provider.tsx`, `animation-context.tsx`, `titlebar.tsx`.
- **`types/`** — TypeScript type definitions that mirror Rust structs for IPC safety. Re-exported from `index.ts`.
- **`styles/globals.css`** — All theme variables (oklch colors), TailwindCSS v4 directives. Color schemes added here + in `src/types/settings.ts`.

### Backend (`src-tauri/src/`)
- **`lib.rs`** — Registers all Tauri IPC commands in `invoke_handler`.
- **`commands/`** — 18 modules, each handling a domain. Most are single files; `agent/` is a directory module split into `mod.rs`, `commands.rs`, `memory.rs`, `files.rs`, `attachments.rs`, `conversations.rs`, `search.rs`.
- **`mcp/`** — HTTP JSON-RPC server (port 8377 default) for remote LLM control via Bearer token auth.
- **`types/`** — Rust struct definitions mirroring frontend types.

### Data Folder (Portable)
Created at runtime alongside the `.exe` (dev: `src-tauri/data/`):
```
data/
├── programs/      # Portable tools + icons/
├── reports/       # Service run reports (JSON)
├── scripts/       # Custom scripts
├── logs/          # App logs
├── settings.json  # User preferences
└── agent.db       # SQLite for agent memory
```

## Key Patterns & Conventions

### Tauri IPC — Critical: Use snake_case Parameters
Tauri does NOT auto-convert camelCase to snake_case. Always use snake_case when calling commands from TypeScript:
```typescript
// ❌ WRONG
await invoke('approve_command', { commandId: id });
// ✅ CORRECT
await invoke('approve_command', { command_id: id });
```

### Adding a Tauri Command
1. Add `#[tauri::command]` function in the relevant `src-tauri/src/commands/*.rs` file
2. Register in `invoke_handler` in `src-tauri/src/lib.rs`
3. Add permissions to `src-tauri/capabilities/default.json` if needed
4. Call from frontend: `invoke('command_name', { args })`

### Settings System
- **Access**: `useSettings()` hook from `@/components/settings-context`
- **Theme**: `useTheme()` hook from `@/components/theme-provider`
- **Adding a setting**: Add to Rust struct in `src-tauri/src/types/settings.rs`, mirror in `src/types/settings.ts`, add match arm in `src-tauri/src/commands/settings.rs`, add UI in `SettingsPage.tsx`

### Animation System
- Toggle-able via `appearance.enableAnimations` setting
- Import from `@/components/animation-context`: `useAnimation`, `motion`, `AnimatedList`, `AnimatedItem`
- Use preset props (`fadeIn`, `fadeInUp`, `fadeInScale`, `staggerContainer`, `staggerItem`, `hoverScale`, `hoverLift`)

### Service System
4-step flow: **Presets → Queue → Runner → Results**
- Definitions in `src-tauri/src/commands/services.rs` → `get_all_service_definitions()`
- Each service implements a match arm in `run_service()`
- Parallel execution uses `exclusive_resources` tags to prevent conflicts
- See `docs/adding-services.md` for the full guide

### Agent System
- AI chat via Vercel AI SDK (`ai`, `@ai-sdk/react`) with multiple provider support
- Tool definitions in `src/lib/agent-tools.ts`; backend commands in `src-tauri/src/commands/agent.rs`
- Command approval modes: `always` (default), `whitelist`, `yolo`
- Memory stored in SQLite (`data/agent.db`), types: `fact`, `solution`, `conversation`, `instruction`
- See `docs/agent-system.md` for full documentation

## Known Expected Lint Warnings (CSS)
These are valid TailwindCSS v4 / Windows-specific syntax — ignore them:
- `Unknown at rule @custom-variant`, `@theme`, `@apply`
- `Unknown property: 'app-region'` (titlebar drag region)
