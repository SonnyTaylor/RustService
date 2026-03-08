<p align="center">
  <img src="public/icon.png" width="128" height="128" alt="RustService Logo">
  <h1 align="center">RustService</h1>
  <p align="center">
    <strong>A blazing-fast portable toolkit for computer repair technicians</strong>
  </p>
  <p align="center">
    Built with Tauri 2.0 · React · Rust · Windows Native
  </p>
</p>

---

## ✨ Features

### 🔧 Modular Service Automation
Run diagnostic and maintenance services with a beautiful 4-step workflow:
- **Presets** → Choose from Diagnostics, General, Complete, or build Custom
- **Queue** → Drag-and-drop reordering, per-service configuration
- **Runner** → Real-time log streaming with live progress
- **Results** → Detailed findings, technical printout, or customer-friendly summary

**19+ Built-in Services:**
| Category | Services |
|----------|----------|
| Diagnostics | Ping Test, Speedtest, iPerf, WinSAT, SmartCTL, WhyNotWin11 |
| Stress Testing | FurMark, HeavyLoad, CHKDSK |
| Cleanup | BleachBit, Drive Cleanup, DISM, SFC |
| Security | KVRT, AdwCleaner, Trellix Stinger |
| System | Windows Update, Battery Info, Disk Space |

### 💻 System Information
Comprehensive hardware & OS reporting at a glance:
- CPU, GPU, RAM, Storage details
- Battery health & power stats
- Network interfaces & temperature sensors
- One-click clipboard copy for quick sharing

### 🚀 Portable Programs Launcher
- Manage & launch portable tools from a single interface
- Automatic icon extraction from executables
- Track usage with launch counts & last-used timestamps
- Auto-detection of required service dependencies

### 📊 Event Log Viewer
- Filter Windows Event Logs by level, source, or keyword
- Quick access to Application, System, and Security logs
- Direct links to detailed event information

### 🌐 Network Diagnostics
- Visual ping statistics with latency graphs
- DNS lookup & traceroute tools
- Port scanning & connectivity checks

### 🔄 Startup Manager
- View & manage Windows startup programs
- Enable/disable entries without registry diving
- See publisher & command info at a glance

### 📋 Reports System
- Auto-save service run results
- View historical reports with full details
- Print-ready customer & technician views

### ⚙️ Fully Customizable
- Light & dark theme with multiple color schemes
- Smooth Framer Motion animations (toggleable)
- Business mode with technician/customer details
- Configurable service presets

---

## 🏁 Quick Start

### Prerequisites
- Windows 10/11
- Bun ([bun.sh](https://bun.sh/))
- Rust toolchain ([rustup.rs](https://rustup.rs/))

### Development
```bash
bun install           # Install dependencies
bun tauri dev         # Run in dev mode
```

### Build
```bash
bun tauri build       # Build portable executable
# Output: src-tauri/target/release/rustservice.exe
```

---

## 📁 Portable Data

Everything stays next to the executable—perfect for USB drives:

```
rustservice.exe
data/
├── programs/      # Portable tools & icons
├── reports/       # Saved service reports
├── logs/          # Application logs
├── scripts/       # Custom scripts
└── settings.json  # Your preferences
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Tauri 2.0 |
| Frontend | React + TypeScript + Vite |
| Styling | TailwindCSS v4 + shadcn/ui |
| Backend | Rust |
| System Info | sysinfo, gfxinfo, battery crates |
| Animations | Framer Motion |
| Drag & Drop | dnd-kit |

---

## 📚 Documentation

- [Adding Services](docs/adding-services.md) — Create new diagnostic/maintenance services
- [Animation System](docs/animations.md) — Framer Motion integration guide

---

## 📄 License

This project is proprietary software.

---

<p align="center">
  <sub>Made with ❤️ and way too much ☕</sub>
</p>
