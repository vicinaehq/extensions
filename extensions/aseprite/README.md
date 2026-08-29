# Aseprite Extension

Browse, open, and copy paths of recent Aseprite files from Vicinae.

## Features

- **Open Recents** - Browse and open your recently used Aseprite files
- **Copy Paths** - Copy file paths to clipboard
- **Previews** - Optional PNG previews for `.ase` and `.aseprite` files with file icon fallback. Can be disabled for faster loading

## Commands

| Command | Title | Description |
|---------|-------|-------------|
| `open-recent` | Open Recents | List, open, and copy paths of recent Aseprite files |

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
