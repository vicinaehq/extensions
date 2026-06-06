# Hypr

Vicinae extension for inspecting Hyprland state through `hyprctl`.

Basically a port of the [niri](https://github.com/vicinaehq/extensions/tree/main/extensions/niri) vicinae extension.

Commands:

- `outputs`: active and inactive outputs from `hyprctl -j monitors all`
- `workspace`: workspaces from `hyprctl -j workspaces`
- `layers`: layer-shell surfaces from `hyprctl -j layers`
- `monitors`: active monitors from `hyprctl -j monitors`
- `windows`: clients from `hyprctl -j clients`
- `keybinds`: keybinds from `hyprctl -j binds`, add description to your commands to get any meaningful information from this
