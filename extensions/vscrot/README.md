# VScrot

A Vicinae extension for taking, annotating, and managing screenshots across Linux (Wayland & X11), macOS, and Windows.

---

## Commands

### `scrot` - Take a Screenshot

The main command. Opens a list of capture modes filtered to what your active tool supports. After capture, a preview lets you save, copy to clipboard, annotate, or discard.

**Capture modes:**

| Mode | Description |
|---|---|
| Capture Area | Interactive region selection |
| Capture Window | Active or selected window |
| Capture Monitor | A single display |
| Capture All Monitors | Full desktop (all displays merged) |

The **Active Tools** section at the bottom of the list shows which capture and annotation tools are currently in use. Tap either entry to switch to any other installed tool - the choice is saved and persists across sessions.

### `manage-tools` - Manage Tools

Shows all supported capture, annotation, clipboard, and dependency tools grouped by category, with installed/not-installed status. For each missing tool:

- The install command for your detected package manager is shown inline
- **Copy Install Command** copies it to the clipboard
- **Show All Package Managers** shows a full install table for every supported manager
- **Copy Install Script for All Missing Tools** generates a combined script for everything not yet installed

Supported package managers: `pacman`, `apt`, `dnf`, `brew`, `winget`

---

## Capture Backends

VScrot auto-detects the best available tool in priority order. You can override this in **Extension Preferences** or by tapping **Active Tools → Capture** inside the extension.

### Wayland

| Tool | Modes | Notes | Link |
|---|---|---|---|
| **grimblast** | area · window · monitor · full | Hyprland-native wrapper around grim. Recommended for Hyprland. | [hyprwm/contrib](https://github.com/hyprwm/contrib) |
| **grim** + slurp | area · window · monitor · full | Compositor-agnostic Wayland grabber. Requires `slurp` for selection and `jq` for window/monitor modes. | [grim](https://sr.ht/~emersion/grim/) · [slurp](https://github.com/emersion/slurp) |
| **spectacle** | area · window · monitor · full | KDE screenshot tool. Works on Wayland and X11. | [spectacle](https://apps.kde.org/spectacle/) |
| **gnome-screenshot** | area · window · full | GNOME screenshot utility. | [gnome-screenshot](https://gitlab.gnome.org/GNOME/gnome-screenshot) |
| **flameshot** | area · full | Cross-platform. Wayland support varies by compositor - works best on KDE/GNOME Wayland. | [flameshot.org](https://flameshot.org) |

### X11

| Tool | Modes | Notes | Link |
|---|---|---|---|
| **maim** + slop | area · window · full | Recommended X11 tool. Requires `slop` for area selection and `xdotool` for window capture. | [maim](https://github.com/naelstrof/maim) · [slop](https://github.com/naelstrof/slop) |
| **scrot** | area · window · full | Classic X11 capture utility. | [scrot](https://github.com/resurrecting-open-source-projects/scrot) |

### macOS

| Tool | Modes | Notes | Link |
|---|---|---|---|
| **screencapture** | area · window · full | Built-in macOS utility - no installation required. | - |
| **screenshot-desktop** | full · monitor | npm package bundled with the extension. Uses native OS APIs on macOS and Windows. | [screenshot-desktop](https://github.com/bencevans/screenshot-desktop) |

### Windows

| Tool | Modes | Notes | Link |
|---|---|---|---|
| **screenshot-desktop** | full · monitor | npm package bundled with the extension. Uses Win32 GDI - no additional install needed. | [screenshot-desktop](https://github.com/bencevans/screenshot-desktop) |
| **flameshot** | area · full | Available for Windows via the official installer. | [flameshot.org](https://flameshot.org) |

---

## Annotation Tools

After capture, the preview offers an **Annotate** action using your active annotation tool. Tools are split into two modes:

- **Auto-reload** - the tool is launched, blocks until you close it, then the preview refreshes automatically.
- **Manual save** - the tool opens in the background; save the file yourself, then use **Refresh Preview** inside the extension.

| Tool | Mode | Platform | Link |
|---|---|---|---|
| **satty** | Auto-reload | Linux (Wayland) | [gabm/Satty](https://github.com/gabm/Satty) |
| **swappy** | Auto-reload | Linux (Wayland) | [jtheoof/swappy](https://github.com/jtheoof/swappy) |
| **GIMP** | Manual save | Linux · macOS · Windows | [gimp.org](https://www.gimp.org) |
| **Pinta** | Manual save | Linux · macOS · Windows | [pinta-project.com](https://www.pinta-project.com) |
| **Paint** (mspaint) | Manual save | Windows (built-in) | - |
| **None** | - | All | Disables the Annotate action |

Auto-detection priority: satty → swappy → GIMP → Pinta → Paint

---

## Clipboard Tools

Images are copied to the clipboard using platform-native tools with automatic fallback:

| Tool | Platform | Link |
|---|---|---|
| **wl-copy** (wl-clipboard) | Linux Wayland (primary) | [wl-clipboard](https://github.com/bugaevc/wl-clipboard) |
| **xclip** | Linux X11 (fallback) | [xclip](https://github.com/astrand/xclip) |
| **pbcopy** | macOS (built-in) | - |
| PowerShell clipboard | Windows (built-in) | - |

---

## Dependencies

These are not capture tools themselves but are required by certain backends:

| Dependency | Required by | Link |
|---|---|---|
| **slurp** | grim (area · window · monitor modes) | [slurp](https://github.com/emersion/slurp) |
| **jq** | grim (window · monitor modes via hyprctl) | [jqlang/jq](https://github.com/jqlang/jq) |
| **slop** | maim (area selection) | [slop](https://github.com/naelstrof/slop) |
| **xdotool** | maim (window capture) | [xdotool](https://github.com/jordansissel/xdotool) |
| **ImageMagick** (`identify`) | Preview metadata (image dimensions) - optional | [imagemagick.org](https://imagemagick.org) |

---

## Preferences

Preferences are the default starting point. Active tool selections made inside the extension are saved per-session via LocalStorage and override preferences.

| Preference | Description | Default |
|---|---|---|
| **Screenshot Tool** | Capture backend. `Auto-detect` picks the first available in priority order. | `auto` |
| **Annotation Tool** | Annotation tool. `Auto-detect` picks the first available. `None` disables annotation. | `auto` |
| **Screenshot Path** | Base folder where screenshots are saved. | `~/Pictures/Screenshots` |
| **Subfolder Format** | `strftime`-style subfolder name (e.g. `%d-%m-%Y`). Leave blank to save directly in the base folder. | `%d-%m-%Y` |
| **Filename Format** | `strftime`-style filename (e.g. `Screenshot_%d-%m-%Y_%H-%M-%S`). | `Screenshot_%d-%m-%Y_%H-%M-%S` |
| **Copy to Clipboard** | Copy to clipboard automatically after capture. | `true` |
| **Save to File** | Save to file automatically after capture. | `true` |

**Supported date tokens:** `%Y` `%m` `%d` `%H` `%M` `%S`

---

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production bundle
npm run lint   # type-check + lint
npm run format # biome format
```
