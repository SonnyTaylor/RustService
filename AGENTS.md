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

## Dependencies to Know

| Package | Purpose |
|---------|---------|
| `@tauri-apps/api` | Frontend-to-Rust IPC |
| `lucide-react` | Icon library |
| `class-variance-authority` | Component variants (shadcn) |
| `tailwind-merge` | Merge Tailwind classes (shadcn) |
| `sysinfo` | System hardware/OS info (Rust) |
| `gfxinfo` | GPU information (Rust) |
| `battery` | Battery status (Rust) |
