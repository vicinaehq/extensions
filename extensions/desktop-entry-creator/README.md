# Desktop Entry Creator

A Vicinae extension to create `.desktop` files for Linux applications.

## Usage

Open Vicinae and search for **"Create Desktop Entry"**.

Fill in:
- **App Name** — display name shown in app launchers
- **Exec Command** — command to run (e.g. `myapp`, `/usr/bin/myapp %u`)
- **Icon** — theme icon name (e.g. `firefox`) or absolute path to a `.png`/`.svg`
- **Comment** *(optional)* — short description
- **Categories** *(optional)* — semicolon-separated XDG categories (e.g. `Utility;Network;`)
- **Terminal** — whether to run inside a terminal emulator
- **Startup Notify** — show loading indicator on launch

## Actions

| Shortcut | Action |
|---|---|
| `Enter` | Write `.desktop` file to disk |
| `⌘C` | Copy `.desktop` content to clipboard |
| `⌘P` | Preview the generated content |

## Install location

- **Local** — `~/.local/share/applications/` (no sudo required, only for your user)
- **Global** — `/usr/share/applications/` (requires sudo; extension writes to `/tmp/` and gives you the `sudo mv` command to copy)

## Installation

```bash
cd desktop-entry-creator
npm install
npm run build
```
