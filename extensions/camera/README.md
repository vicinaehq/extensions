## Overview

**Camera** brings quick webcam access to Vicinae, similar to Raycast's built-in "Open Camera" command. Check yourself before a call, or grab a quick snapshot, without leaving the launcher.

---

## Features

- **Automatic Camera Detection**: Finds connected video capture devices using `v4l2-ctl` when available, falling back to `/dev/video*` and sysfs device names otherwise.
- **Live Preview**: Starts a dedicated preview window (`ffplay`) for the selected camera, with a single action to stop it again.
- **Instant Photo Capture**: Captures a still photo (`ffmpeg`) to a configurable folder, with optional auto-copy to clipboard and auto-open.
- **Quick Capture Command**: A `Take Photo` no-view command for a single-keystroke snapshot from your default camera, ideal for binding to a shortcut.
- **Managed Process Lifecycle**: Tracks the live preview's PID so it can be stopped cleanly from Vicinae, without touching unrelated processes.

---

## Requirements

This extension requires the following system utility:

1. **`ffmpeg`** — used to capture photos and, via `ffplay`, to show the live preview.

`v4l2-ctl` (from the `v4l-utils` package) is optional but recommended for more reliable camera names and detection.

### Installing Dependencies

#### Arch Linux / Manjaro / EndeavourOS

```bash
sudo pacman -S ffmpeg v4l-utils
```

#### Ubuntu / Debian

```bash
sudo apt install ffmpeg v4l-utils
```

#### Fedora

```bash
sudo dnf install ffmpeg v4l-utils
```

---

## Usage

1. Open **Vicinae launcher**.
2. Type **`Open Camera`** and press <kbd>Enter</kbd>.
3. If more than one camera is detected, pick one from the list.
4. Press **Start Camera Preview** for a live feed, or **Take Photo** to capture an instant snapshot.
5. Use **Take Photo** directly from the root search (or bind it to a shortcut) for a one-keystroke capture from your default camera.

---

## Preferences

| Preference | Description | Default |
| --- | --- | --- |
| Save Directory | Folder where captured photos are saved | `~/Pictures/Webcam` |
| Capture Resolution | Requested resolution for preview and photos | Auto |
| Copy to Clipboard | Copy each captured photo to the clipboard | On |
| Open After Capture | Open each captured photo in your default viewer | Off |
| Default Camera Device (Take Photo only) | Device path used for quick capture, e.g. `/dev/video0` | Auto-select first camera |

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
- **[FFmpeg](https://ffmpeg.org/)** — Used to capture photos and preview the live camera feed.
- **[v4l-utils](https://git.linuxtv.org/v4l-utils.git/)** — Optional utility used for more reliable camera detection.
