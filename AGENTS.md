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
1. Update `AppSettings` type in `src/types/settings.ts`
2. Update Rust `AppSettings` struct in `lib.rs`
3. Add UI control in `SettingsPage.tsx`

### Update window config
Edit `src-tauri/tauri.conf.json` - requires dev server restart

## Known Lint Warnings

These CSS warnings are **expected** and can be ignored:
- `Unknown at rule @custom-variant` - TailwindCSS v4 syntax
- `Unknown at rule @theme` - TailwindCSS v4 syntax  
- `Unknown at rule @apply` - TailwindCSS directive
- `Unknown property: 'app-region'` - Windows-specific CSS for titlebar dragging

## Dependencies to Know

| Package | Purpose |
|---------|---------|
| `@tauri-apps/api` | Frontend-to-Rust IPC |
| `lucide-react` | Icon library |
| `class-variance-authority` | Component variants (shadcn) |
| `tailwind-merge` | Merge Tailwind classes (shadcn) |
