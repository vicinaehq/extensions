<p align="center">
  <img src="assets/extension_icon.png" width="128" height="128" alt="Umbriel extension icon" />
</p>

<h1 align="center">Umbriel</h1>

## Overview

A Vicinae extension for inspecting and controlling the Umbriel Wayland compositor. Browse outputs, windows, workspaces, scratchpads, layer surfaces, keyboard layouts, screencasts, virtual outputs, and configured keybinds — all from the launcher.

> Everything the extension changes is **runtime-only**. It never writes to your Umbriel configuration.

## Features

| Command              | What it does                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Outputs**          | Inspect outputs, enable or disable monitors, power outputs on or off, power off all monitors, and copy monitor details.          |
| **Windows**          | Browse windows by monitor and workspace, then focus, warp the cursor to, close, or kill the selected window.                     |
| **Workspaces**       | Switch workspaces, change layout, move or swap workspaces between outputs, and move the focused window or column to a workspace. |
| **Scratchpads**      | List all scratchpads. Toggle a scratchpad by name.                                                                               |
| **Layers**           | Inspect layer-shell surfaces and their protocol properties.                                                                      |
| **Keyboard Layouts** | Show configured layouts, the active layout, and cycle to the next layout.                                                        |
| **Screencast**       | Select and follow screencast targets.                                                                                            |
| **Virtual Outputs**  | Create a virtual output or destroy an existing virtual output.                                                                   |
| **Keybinds**         | Browse keybinds grouped by action category, with submap, arguments, and source file information.                                 |

## Development

- Node.js (v20 or newer)
- npm, pnpm, or bun
- Vicinae

```bash
npm install
npm run dev    # Development mode
npm run build  # Production bundle
```

## Links

- [Umbriel](https://docs.noctalia.dev/umbriel/) — The compositor this extension integrates with.
- [Vicinae](https://www.vicinae.com/) — A focused application launcher for your desktop.
