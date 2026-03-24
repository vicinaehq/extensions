# Vicinae GNOME Extensions

Manage your GNOME Shell extensions directly from Vicinae.

## Requirements

- GNOME Shell environment
- `gnome-extensions` CLI tool
- `curl` command-line tool
- Internet connection (for extension screenshots)

> _Optional: dconf editor (for extension settings)_

### Install the requirements

Make sure the `gnome-extensions` CLI is installed. On most distros it's included with GNOME Shell. If not:

**Ubuntu**
```shell
sudo apt install gnome-shell-extensions curl
```

**Fedora**
```shell
sudo dnf install gnome-shell-extensions curl
```

**Arch**
```shell
sudo pacman -S gnome-shell-extensions curl
```

## Features

- List all installed GNOME extensions
- Enable/disable extensions with one click
- Open extension preferences
- Access extension settings
- Open the extension in Dconf Editor (if schema is available)
- View extension screenshots from extensions.gnome.org
- Copy extension UUID to clipboard
- Open extension's Homepage
- Search through extensions

## Usage

1. Run the `GNOME Extensions` command in Vicinae
2. Browse your installed extensions
3. Use actions to enable/disable or configure extensions
4. Press Enter to view extension details with screenshot

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
