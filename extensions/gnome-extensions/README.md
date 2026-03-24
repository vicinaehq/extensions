# Vicinae GNOME Extensions

Manage your GNOME Shell extensions directly from Vicinae.

## Requirements

- GNOME Shell environment
- `gnome-extensions` CLI tool (part of GNOME Shell)

## Features

- List all installed GNOME extensions
- Enable/disable extensions with one click
- Open extension preferences
- Access extension settings
- Copy extension UUID to clipboard
- Open extension's Homepage
- Search through extensions

## Usage

1. Run the `GNOME Extensions` command in Vicinae
2. Browse your installed extensions
3. Use actions to enable/disable or configure extensions

## Commands

| Command | Description |
| --- | --- |
| `GNOME Extensions` | List and manage installed GNOME Shell extensions |

## Preferences

- **Extension Manager Path** – Path to your extension manager command (default: `gnome-extensions`)
- **Show Disabled Extensions** – Include disabled extensions in the list

## Development

```bash
cd extensions/gnome-extensions
npm install
npm run dev
```

## Requirements

Make sure the `gnome-extensions` CLI is installed. On most distros it's included with GNOME Shell. If not:

```bash
# Debian/Ubuntu
sudo apt install gnome-shell-extensions

# Fedora
sudo dnf install gnome-shell-extensions

# Arch
sudo pacman -S gnome-shell-extensions
```
