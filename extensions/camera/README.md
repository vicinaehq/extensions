## Overview

**Camera** brings quick webcam access to Vicinae, similar to Raycast's built-in "Open Camera" command. Check yourself before a call, or grab a quick snapshot, without leaving the launcher.

---

## Features

- **Automatic Camera Detection**: Finds connected video capture devices via `/dev/video*` and sysfs device names.
- **In-App Live Preview**: Shows a refreshing preview (about once per second) right inside the Vicinae window — no external window is opened.
- **Instant Photo Capture**: Captures a still photo to a configurable folder, with optional auto-copy to clipboard and auto-open.
- **Quick Capture Command**: A `Take Photo` no-view command for a single-keystroke snapshot from your default camera, ideal for binding to a shortcut.

---

## Requirements

This extension requires the following system utility:

1. **`ffmpeg`** — used to capture photos and refresh the live preview.

Grabbing frames from `/dev/video*` needs either compiled native code or an external program; there's no pure-JavaScript way to do it. `ffmpeg` is the most broadly available, single-package option (it also keeps working on Flatpak/immutable/NixOS systems where installing a full C/C++ toolchain for a native module is awkward or blocked).

### Installing ffmpeg

#### Arch Linux / Manjaro / EndeavourOS

```bash
sudo pacman -S ffmpeg
```

#### Ubuntu / Debian

```bash
sudo apt install ffmpeg
```

#### Fedora

```bash
sudo dnf install ffmpeg
```

If `ffmpeg` isn't found, the extension shows a screen with the exact command for your distro and a Retry action — it never fails silently.

### macOS (unsupported for now)

The extension's device detection and capture code has a macOS path (via ffmpeg's `avfoundation` input) and isn't gated behind the platform check, so it will run if you install it on a Mac. In testing, though, actual capture hangs indefinitely: macOS never shows a camera-permission prompt for the plain `ffmpeg` binary spawned by Vicinae's extension host, and no entry is created under System Settings → Privacy & Security → Camera to grant it manually, even though native apps (QuickTime, Photo Booth) access the same camera fine. This looks like a gap in how Vicinae's extension runtime is code-signed/entitled for TCC-gated device access - something that would need to be fixed in Vicinae itself, not in a third-party extension. Because of that, `macOS` is intentionally left out of this extension's declared `platforms` until that's resolved upstream.

---

## Usage

1. Open **Vicinae launcher**.
2. Type **`Camera Preview`** and press <kbd>Enter</kbd>.
3. If more than one camera is detected, pick one from the list.
4. Press **Start Live Preview** for a refreshing feed, or **Take Photo** to capture an instant snapshot.
5. Use **Take Photo** directly from the root search (or bind it to a shortcut) for a one-keystroke capture from your default camera.

---

## Preferences

| Preference | Description | Default |
| --- | --- | --- |
| Save Directory | Folder where captured photos are saved | `~/Pictures/Webcam` |
| Capture Resolution | Requested resolution for preview and photos | Auto |
| Copy to Clipboard | Copy each captured photo to the clipboard | On |
| Open After Capture | Open each captured photo in your default viewer | Off |
| Default Camera Device (Take Photo only) | Device path used for quick capture, e.g. `/dev/video0`. Leave empty to auto-select the first detected camera. | Auto-select first camera |

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
- **[FFmpeg](https://ffmpeg.org/)** — Used to capture photos and refresh the live preview.
