## Overview

A Vicinae extension for managing connected displays on the Niri Wayland compositor. Turn monitors on or off, change resolution, scale, and rotation, and arrange them on a visual canvas — all without leaving the launcher.

## Features

- **Monitor overview** — see model, resolution, refresh rate, rotation, scale, and enabled state at a glance.
- **Runtime adjustments** — quick actions that apply immediately and reset when Niri restarts.
- **Persistent settings** — store all display settings in niri config so they persist across restarts.
- **Position canvas** — arrange displays on a visual canvas and preview the layout.
- **Keyboard-first workflow** — dedicated shortcuts for every single action.
- **Clipboard utilities** — copy a monitor's name, model, or resolution.
- **Global controls** — power off all monitors at once.

## Usage

Install **Niri Monitors** from Vicinae Extension Store then run **Monitor Settings** in launcher to see a list of your connected displays. Each row shows the monitor's current rotation and scale at a glance, so you can check your setup without opening the action panel.

Select a monitor to choose between two ways of changing its settings:

### Quick actions

Runtime-only changes that apply instantly via `niri msg` and reset the next time niri restarts. Good for testing a setting or a temporary change.

> **Note:** Quick actions apply directly to your active session and **take precedence over saved configuration** until you restart or reload Niri.

| Action                   | Shortcut          |
| ------------------------ | ----------------- |
| Enable / disable monitor | `Cmd + D`         |
| Set scale                | `Cmd + S`         |
| Set position             | `Cmd + P`         |
| Rotate display           | `Cmd + R`         |
| Set resolution           | `Shift + R`       |
| Refresh list             | `Cmd + Shift + R` |
| Power off all monitors   | `Cmd + Shift + P` |
| Copy monitor name        | `Cmd + C`         |
| Copy model               | `Shift + C`       |
| Copy resolution          | `Cmd + Shift + C` |

> **Note** The enable/disable action only appears when more than one monitor is connected, since you can't disable your only display.

### Arranging displays

The position canvas shows every enabled display to scale. Move the selected display with `Shift + Arrow keys` or `Shift + H/J/K/L`, center it against a neighboring display with `Shift + C`, switch the selected display with `Ctrl + Enter`, and reset the preview with `Shift + R`.

### Edit Persistent Settings

Opens a form to set resolution, scale, rotation, position, and (with more than one monitor connected) enabled state. Submitting asks for confirmation, then writes an `output "<name>" { ... }` block into a dedicated `monitors.kdl` file and adds an `include "monitors.kdl"` line to your niri config if it is not already included. Any output blocks already in `config.kdl` are moved into `monitors.kdl` so the include owns all display settings; other config content is left untouched.

niri live-reloads its config on save, so the change applies immediately with no restart needed. If the write ever produced invalid config, niri keeps your last working configuration and shows its own notification rather than breaking your session.

## How it works

Quick actions run entirely through niri's IPC interface (`niri msg`). Persistent settings are written to a dedicated `monitors.kdl` file next to your niri config (or in the directory used by an existing relative include), which is pulled in with an `include` directive. The main config is found in the same place niri itself looks: the `$NIRI_CONFIG` environment variable if set, otherwise `$XDG_CONFIG_HOME/niri/config.kdl`, falling back to `~/.config/niri/config.kdl`.

## Development

```bash
npm install
npm run dev    # Development mode
npm run build  # Production bundle
```

## Links

- [Niri](https://github.com/YaLTeR/niri) — A scrollable Window Manager for Wayland.
- [Vicinae](https://www.vicinae.com/) — A focused Application Launcher for your Desktop.
