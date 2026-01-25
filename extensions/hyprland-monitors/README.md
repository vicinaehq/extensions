# Hyprland Monitors

A Vicinae extension for managing monitor configurations in Hyprland. Easily adjust monitor settings including resolution, refresh rate, scaling, rotation, and positioning.

## Features

- **Resolution & Refresh Rate**: Change resolution and refresh rate from available modes
- **Display Scaling**: Adjust UI scaling
- **Monitor Rotation**: Rotate displays
- **Positioning**: Position monitors relative to each other (Primary, Left, Right, Above, Below)

## Configuration

The extension requires two preferences to be set:

### Hyprland Config Path
Default: `~/.config/hypr/hyprland.conf`

Path to your main Hyprland configuration file. The extension will automatically add a source line to include the Vicinae monitors configuration.

### Vicinae Monitors Config Path
Default: `~/.config/hypr`

Directory where the extension will store the `vicinae-monitors.conf` file containing your monitor rules.

## Usage

1. Open the extension from Vicinae
2. Select a monitor from the list
3. Adjust settings:
   - **Resolution**: Choose from available display modes
   - **Scale**: Select UI scaling factor
   - **Transform**: Rotate the display
   - **Positioning**: Set monitor position relative to others
4. Click "Apply changes"
5. Confirm the changes work correctly within 10 seconds, or they will automatically revert

## How It Works

The extension:
1. Reads connected monitors from Hyprland
2. Stores monitor-specific configurations in `vicinae-monitors.conf`
3. Ensures your main Hyprland config sources this file
4. Applies changes using Hyprland's monitor rules with monitor descriptions for persistence

## Requirements

- Hyprland window manager must be installed and running

## Development

```bash
npm install
npm run dev    # Development mode
npm run build  # Production bundle
```

## License

MIT
