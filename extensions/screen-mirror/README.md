## Overview

**Screen Mirror** brings effortless display mirroring to wlroots-compatible Wayland compositors (such as **Niri**, **Hyprland**, **Sway**, and other `wlroots`-based desktop environments).

Select your source and target monitors from an intuitive interface, start mirroring in fullscreen with a single keystroke, and view real-time mirror status and display metrics.

---

## Features

- **Instant Monitor Discovery**: Automatically detects all connected and active displays with resolutions, refresh rates, and hardware models.
- **Smart Dropdown Synchronization**: Prevents selecting the same monitor for source and target. Automatically adjusts the counterpart selection across dual-monitor and multi-monitor setups.
- **Managed Process Lifecycle**: Manages `wl-mirror` child processes with exact PID tracking, ensuring clean start and stop without affecting unrelated processes.
- **Real-time Active Session Inspector**: Displays a clean metadata panel showing active source/target outputs, hardware details, resolutions, and backend status.
- **Keyboard-Friendly**: Supports quick actions with shortcuts (<kbd>Ctrl</kbd> + <kbd>Enter</kbd> to start, <kbd>Enter</kbd> to stop).

---

## Requirements

This extension requires the following system utilities:

1. **`wl-mirror`** — Wayland screen mirroring client.
2. **`wlr-randr`** — Wayland output management utility.

### Installing Dependencies

#### Arch Linux / Manjaro / EndeavourOS

```bash
sudo pacman -S wl-mirror wlr-randr
```

#### Ubuntu / Debian

```bash
sudo apt install wl-mirror wlr-randr
```

#### Fedora

```bash
sudo dnf install wl-mirror wlr-randr
```

---

## Usage

1. Open **Vicinae launcher**.
2. Type **`Mirror Screen`** and press <kbd>Enter</kbd>.
3. **Select Displays**:
   - **Source Monitor**: The display you want to capture and share.
   - **Target Monitor**: The display where the mirrored output will be displayed in fullscreen.
4. Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> or click **Start Screen Mirror**.
5. While mirroring is active, open the extension at any time to inspect live status or press <kbd>Enter</kbd> / click **Stop Screen Mirror** to stop.

---

## Development

### Prerequisites

- Node.js (v20 or newer)
- npm, pnpm, or bun
- Vicinae

### Setup & Build

```bash
# Install dependencies
npm install

# Run in development mode (live reload in Vicinae)
npm run dev

# Format and lint
npm run format
npm run lint

# Build for production
npm run build
```

---

## Links

- **[Vicinae](https://github.com/vicinaehq/vicinae)** — A focused Application Launcher for your Desktop.
- **[wl-mirror](https://github.com/Ferdi265/wl-mirror)** — Simple Wayland screen mirror client using wlroots screencopy protocol.
- **[Wayland](https://wayland.freedesktop.org/)** — Modern display server protocol for Linux desktops.
