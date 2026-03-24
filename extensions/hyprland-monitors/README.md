# Hyprland Monitors

A Vicinae extension for managing monitor configurations in Hyprland. Easily adjust monitor settings including resolution, refresh rate, scaling, rotation, and positioning.

## Features

- **Resolution & Refresh Rate**: Change resolution and refresh rate from available modes
- **Display Scaling**: Adjust UI scaling
- **Monitor Rotation**: Rotate displays
- **Positioning**: Position monitors relative to each other (Primary, Left, Right, Above, Below)


## Commands

- **Monitor Settings**: Opens monitor settings and lets you configure displays
- **Configure active monitor**: Opens the active monitor configuration flow directly


## Persisted Configuration

Persisted configuration is optional. By default, changes are not persisted. Enable persisted mode with the **Persist Changes** preference.

The extension uses the following preferences:

### Persist Changes
Default: `false`

When enabled, monitor changes are written to `vicinae-monitors.conf` and reused. When disabled (default), changes are applied without persisting monitor rules.

### Hyprland Config Path
Default: `~/.config/hypr/hyprland.conf`

Path to your main Hyprland configuration file. The extension will automatically add a source line to include the Vicinae monitors configuration.

### Vicinae Monitors Config Path
Default: `~/.config/hypr`

Directory where the extension will store the `vicinae-monitors.conf` file containing your monitor rules.

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
