# Manage Webapps

Create, edit, launch, and remove Linux web app `.desktop` entries from Vicinae.

This extension is intended for users who pin websites as desktop apps, usually with Chromium-style app windows such as `--app=https://example.com`. It can also keep one window per web app by focusing an existing window before launching another one.

## Features

- Create, edit, delete, search, and launch managed web app desktop entries
- Write `.desktop` files to a configurable applications directory
- Use configurable browser commands and argument templates
- Download favicons for launcher icons through DuckDuckGo's favicon service
- Convert downloaded WebP favicons to PNG when needed
- Export and import managed web app configuration as JSON
- Refresh one favicon or every managed favicon
- Optional single-window behavior that focuses an existing app window before launching
- Automatic window match learning on first launch
- Optional generated global shortcut configuration for supported window managers

## Supported Window Managers

Single-window focus support is available for:

- `niri`
- `hyprland`
- `sway`
- `i3`
- `custom`

Generated global shortcut installation is available for:

- `niri`
- `hyprland`
- `sway`
- `i3`

The `custom` backend can run a user-provided focus command, but it does not install global shortcuts automatically.

## Requirements

- Linux desktop environment
- Vicinae
- Node.js and npm for local development
- `jq` for automatic window detection and single-window focus behavior
- One of the supported window manager CLIs when using a built-in backend:
  - `niri`
  - `hyprctl`
  - `swaymsg`
  - `i3-msg`

Browser defaults are optimized for Chromium-compatible browsers, but each entry can override the browser command and arguments.

## Installation

Install from the Vicinae store once this extension has been published.

For local development or manual installation:

```bash
npm install
npm run build
```

The `postbuild` script copies `@cwasm/webp`'s `webp.wasm` file into Vicinae's local extension directory so favicon conversion works at runtime.

For development mode:

```bash
npm run dev
```

Then open Vicinae and run `Manage Webapps`.

## Preferences

Configure these in Vicinae extension preferences:

| Preference | Default | Description |
| --- | --- | --- |
| Desktop Entries Directory | `~/.local/share/applications` | Directory where managed `.desktop` files are written |
| Browser Command | `chromium-browser` | Browser executable or command prefix |
| Browser Args Template | `--app={url}` | Browser arguments used by new entries |
| Window Manager | `niri` | Backend used for focusing existing windows |
| Custom Focus Command | empty | Command used only when Window Manager is `custom` |

Browser argument templates support:

- `{url}`
- `{origin}`
- `{hostname}`

Examples:

```text
--app={url}
--new-window {url}
--profile-directory=Default --app={url}
```

Custom focus commands support:

- `{match}`
- `{mode}`

The custom command should focus a matching window and exit `0` on success. It should exit non-zero when no window matched.

## Usage

Run `Manage Webapps` in Vicinae.

Use `Shift+Enter` or `Create Desktop Entry` to add a web app. Fill in the entry name, URL, optional comment, optional global shortcut, browser command, browser arguments, and single-window settings.

Managed files are named like `vicinae-<entry-name>.desktop` and include `X-Vicinae-*` metadata so the extension only manages entries it created.

Useful actions:

- `Edit Desktop Entry`: update an existing entry
- `Open Webapp`: run the generated launcher script
- `Refresh Favicon`: refetch the selected entry favicon
- `Refresh All Favicons`: refetch every managed favicon and refresh shortcut files
- `Export Webapp Config`: write and copy JSON backup data
- `Import Webapp Config`: import exported JSON from a file or pasted text
- `Install Global Shortcuts`: write window manager shortcut config
- `Show Desktop File`: open the generated `.desktop` file location
- `Delete Desktop Entry`: remove the desktop entry, icon, launcher script, and window state files

## Single-Window Mode

Each entry can enable `Reuse and focus existing window if already open`.

Match strategies:

- `App ID`
- `Class`
- `Title`
- `Any Field`

On first launch, the generated launcher script records current windows, launches the app, waits for the new window, detects the selected match value, and stores it under the extension support directory. Later launches try to focus a matching existing window before starting a new browser process.

If focus behavior is unreliable for a specific browser or site, edit the entry and try a different match strategy.

## Global Shortcuts

Set `Global Shortcut` on entries with values such as:

```text
ctrl+shift+g
alt+space
super+b
```

Supported modifiers include `ctrl`, `shift`, `alt` or `opt`, and `super` or `cmd`.

Run `Install Global Shortcuts` after adding or changing shortcuts. Saving or deleting an entry also refreshes generated shortcut configuration.

Generated files:

| Window manager | Generated file | Main config update |
| --- | --- | --- |
| `niri` | `~/.config/niri/vicinae-webapps.kdl` | Adds `include "vicinae-webapps.kdl"` to `~/.config/niri/config.kdl` |
| `hyprland` | `~/.config/hypr/vicinae-webapps.conf` | Adds `source = ~/.config/hypr/vicinae-webapps.conf` to `~/.config/hypr/hyprland.conf` |
| `sway` | `~/.config/sway/vicinae-webapps.conf` | Adds `include ~/.config/sway/vicinae-webapps.conf` to `~/.config/sway/config` |
| `i3` | `~/.config/i3/vicinae-webapps.conf` | Adds `include ~/.config/i3/vicinae-webapps.conf` to `~/.config/i3/config` |

Hyprland, Sway, and i3 configs are reloaded on a best-effort basis after installation.

## Export and Import

`Export Webapp Config` writes `webapp-config-export.json` under the Vicinae extension support directory and copies the JSON to the clipboard.

`Import Webapp Config` accepts either that JSON file or pasted JSON. Existing entries are updated when the exported ID matches, or when the same name and URL already exist.

The export format is:

```json
{
  "schema": "vicinae-webapp-config",
  "version": 1,
  "exportedAt": "2026-05-27T00:00:00.000Z",
  "entries": []
}
```

## Project Structure

```text
.
|-- assets/extension_icon.png
|-- scripts/copy-webp-wasm.cjs
|-- src/manage-desktop-entries.tsx
|-- src/lib/desktop-entry-manager.ts
|-- package.json
|-- package-lock.json
`-- tsconfig.json
```

Key files:

- `package.json`: Vicinae manifest, command declaration, preferences, scripts, and dependencies
- `src/manage-desktop-entries.tsx`: Vicinae UI, actions, import/export, shortcut config generation
- `src/lib/desktop-entry-manager.ts`: desktop file parsing/writing, launcher script generation, favicon handling
- `scripts/copy-webp-wasm.cjs`: copies the WebP WASM runtime after build
- `assets/extension_icon.png`: extension icon used by the manifest

## Development

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Format:

```bash
npm run format
```

Lint and validate the Vicinae extension manifest:

```bash
npm run lint
```

## Publishing to `vicinaehq/extensions`

The upstream repository expects store extensions under `extensions/<package-name>/`. For this extension, the target directory is:

```text
extensions/webapp-manager/
```

PR preparation checklist:

- Place this package at `extensions/webapp-manager/`
- Keep `package-lock.json` committed
- Keep `assets/extension_icon.png` committed
- Run `npm install` if dependencies changed
- Run `npm run build`
- Run `npm run lint`
- Confirm the extension opens in Vicinae and the `Manage Webapps` command loads
- In the PR description, mention that the extension writes `.desktop` files, generated launcher scripts, generated window manager shortcut files, and favicon image files

## Troubleshooting

### Entry launches but does not focus an existing window

- Ensure `jq` is installed
- Ensure the selected window manager CLI exists
- Launch once after enabling single-window mode so the match value can be learned
- Try a different match strategy in the entry form

### Desktop icon is generic or missing

- Use `Refresh Favicon`
- Use `Refresh All Favicons`
- Check network access to `https://icons.duckduckgo.com/ip3/<domain>.ico`
- If favicon download fails, the entry falls back to `web-browser`

### Desktop entry does not appear in the launcher menu

Some environments need the desktop application database refreshed manually:

```bash
update-desktop-database ~/.local/share/applications
```

### Global shortcut installation fails

- Confirm the selected window manager is `niri`, `hyprland`, `sway`, or `i3`
- Confirm the main window manager config file exists
- Check for duplicate shortcuts across entries
- Re-run `Install Global Shortcuts`

## Notes

- The extension only lists `.desktop` files marked with `X-Vicinae-Managed=true`
- Deleting an entry removes its generated desktop file, icon, launcher script, and learned window state
- Favicon downloads are best effort and do not block entry creation
- Existing entries can be edited and saved again to regenerate launcher behavior
