# Aseprite Extension

Browse, open, copy paths, and preview recent Aseprite files from Vicinae.

## Features

- **Open Recents** - Browse and open your recently used Aseprite files
- **Copy Paths** - Copy file paths to clipboard
- **Previews** - PNG previews for `.ase` and `.aseprite` files via `aseprite --batch` with file icon fallback. Auto-refreshes on external saves. Disable for faster loading
- **Auto-refresh** - Detects file changes while the extension is open and regenerates previews automatically
- **Refresh Previews** - Press `Cmd+R` to regenerate all previews

## Commands

| Command | Title | Description |
|---------|-------|-------------|
| `open-recent` | Open Recents | List, open, copy paths, and preview recent Aseprite files |

## Preferences

| Preference | Type | Description |
|------------|------|-------------|
| Aseprite Path | Text field | Path to the Aseprite executable (leave empty to use system PATH) |
| Show Preview | Checkbox | Generate PNG previews for `.ase` and `.aseprite` files. Disable for faster loading |

## Installation

```bash
cd extensions/aseprite
npm install
npm run build
```

## Requirements

- Aseprite installed on your system
- Node.js 18+

## Supported Platforms

- Linux
- macOS
- Windows

## License

MIT
