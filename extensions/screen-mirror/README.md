<p align="center">
  <img src="assets/extension_icon.png" width="128" height="128" alt="Screen Mirror extension icon" />
</p>

<h1 align="center">Screen Mirror</h1>

## Overview

A Vicinae extension for mirroring one Wayland display onto another on wlroots-compatible compositors such as Niri, Sway, Hyprland, MangoWC, Umbriel, Wayfire, labwc, and River. Choose a source and target, adjust scaling, rotation, flip, cursor, and region options, then start mirroring fullscreen — all from the launcher.

Built on [`wl-mirror`](https://github.com/Ferdi265/wl-mirror) and [`wlr-randr`](https://sr.ht/~emersion/wlr-randr/), with region selection powered by [`slurp`](https://git.sr.ht/~emersion/slurp).

## Features

- **Fullscreen mirroring** — mirror any connected output onto a target display.
- **Display discovery** — lists active outputs with resolution, refresh rate, and hardware model.
- **Smart selection** — keeps source and target different and adjusts the counterpart automatically.
- **Region capture** — drag a rectangle on screen with `slurp` and mirror only that area.
- **Cursor control** — show or hide the cursor, with the last choice remembered.
- **Scaling** — `fit` (preserve aspect ratio), `cover` (crop to fill), or `exact` (crisp pixels, may add black bars).
- **Transform** — rotate 90°/180°/270° and flip horizontally or vertically.
- **Keyboard-first** — start, select a region, clear it, and stop without leaving the keyboard.

## Requirements

- **`wl-mirror`** — screen capture and mirroring.
- **`wlr-randr`** — display discovery.
- **`slurp`** — interactive region selection.

```bash
# Arch Linux
sudo pacman -S wl-mirror wlr-randr slurp

# Ubuntu / Debian
sudo apt install wl-mirror wlr-randr slurp

# Fedora
sudo dnf install wl-mirror wlr-randr slurp
```

The extension checks these dependencies and shows install instructions if anything is missing.

## Usage

Open **Mirror Screen** from Vicinae, select a **source** and **target** monitor, adjust the optional settings, and press **Start Screen Mirror**.

### Options

- **Cursor** — show or hide the cursor in the mirrored output.
- **Region** — mirror the full output or select a rectangle on screen with `slurp`.
- **Scaling** — `fit` (preserve aspect ratio), `cover` (crop to fill), or `exact` (crisp pixels, may add black bars).
- **Rotation / Flip** — rotate the mirrored image and optionally flip it.

### Shortcuts

| Action          | Shortcut           |
| --------------- | ------------------ |
| Start mirroring | `Ctrl + Enter`     |
| Select region   | `Ctrl + R`         |
| Clear region    | `Ctrl + Shift + R` |
| Stop mirroring  | `Enter`            |

While a mirror is active, reopen the extension to inspect the session or stop it.

## Development

### Prerequisites

- Node.js (v20 or newer)
- npm, pnpm, or bun
- Vicinae

```bash
npm install
npm run dev    # Development mode
npm run build  # Production bundle
```

## Links

- [Vicinae](https://www.vicinae.com/) — A focused Application Launcher for your Desktop.
- [wl-mirror](https://github.com/Ferdi265/wl-mirror) — Wayland screen mirror client.
- [wlr-randr](https://sr.ht/~emersion/wlr-randr/) — Output management utility.
- [slurp](https://github.com/emersion/slurp) — Select a region in a Wayland compositor.
