# Toggle Theme

Toggle system color scheme between light and dark mode via GNOME's gsettings.

## How it works

This extension toggles `org.gnome.desktop.interface color-scheme` between `prefer-dark` and `prefer-light`.

By default, it calls `gsettings` directly. This works on most GNOME-based desktops where `DBUS_SESSION_BUS_ADDRESS` is properly set.

## Environment override

For setups where the default doesn't work (e.g., Hyprland on NixOS where the launcher runs without full session environment), you can set:

```sh
VICINAE_TOGGLE_THEME_CMD=/path/to/your/toggle-script
```

When this env var is set, the extension will call your script instead of using the built-in gsettings logic.

## Requirements

- `gsettings` command available
- `org.gnome.desktop.interface` schema installed (comes with GNOME or gtk3)
- A portal that reads color-scheme preference (e.g., xdg-desktop-portal-gtk)

## NixOS / Hyprland integration

See the `nix/` directory in the source repo for a complete integration example that handles the DBus and schema path issues.
