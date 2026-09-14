## Overview

**Camera** brings quick webcam access to Vicinae, similar to Raycast's built-in "Open Camera" command. Check yourself before a call, or grab a quick snapshot, without leaving the launcher — no separate program to install.

---

## Features

- **No External Program Required**: Captures through the `v4l2camera` native module, which installs automatically alongside the extension instead of requiring you to install a system package like `ffmpeg`.
- **Automatic Camera Detection**: Finds connected video capture devices via `/dev/video*` and sysfs device names.
- **In-App Live Preview**: Shows a refreshing preview (about once per second) right inside the Vicinae window — no external window is opened.
- **Instant Photo Capture**: Captures a still photo to a configurable folder, with optional auto-copy to clipboard and auto-open.
- **Quick Capture Command**: A `Take Photo` no-view command for a single-keystroke snapshot from your default camera, ideal for binding to a shortcut.

---

## Requirements

Nothing to install manually. The extension depends on the `v4l2camera` native module, which is compiled automatically the first time you install the extension (via `npm install`).

That build step only works on **Linux**, and needs a C/C++ toolchain plus your kernel's video4linux2 headers. Most desktop Linux systems already have these; if not:

#### Arch Linux / Manjaro / EndeavourOS

```bash
sudo pacman -S base-devel v4l-utils
```

#### Ubuntu / Debian

```bash
sudo apt install build-essential libv4l-dev
```

#### Fedora

```bash
sudo dnf groupinstall "Development Tools" && sudo dnf install libv4l-devel
```

If the native module fails to build (or you're not on Linux), the extension still loads — it just shows a "Camera support unavailable" screen instead of crashing.

---

## Usage

1. Open **Vicinae launcher**.
2. Type **`Open Camera`** and press <kbd>Enter</kbd>.
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
| Default Camera Device (Take Photo only) | Device path used for quick capture, e.g. `/dev/video0` | Auto-select first camera |

---

## Development

### Prerequisites

- Node.js (v20 or newer)
- npm, pnpm, or bun
- Vicinae
- On Linux, a C/C++ toolchain and video4linux2 headers (see Requirements above) to build the native camera module

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
- **[v4l2camera](https://github.com/bellbind/node-v4l2camera)** — Native Node.js module used to capture frames from video4linux2 devices.
- **[jpeg-js](https://github.com/eugeneware/jpeg-js)** — Pure-JavaScript JPEG encoder, used when the camera doesn't natively produce MJPEG frames.
