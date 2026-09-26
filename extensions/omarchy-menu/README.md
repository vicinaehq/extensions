<img src="assets/extension_icon.png" alt="omarchy-menu" width="96" />

# Omarchy Menu

Use Omarchy's menu from Vicinae.

The extension reads the menu definitions installed by Omarchy at runtime:

- `/usr/share/omarchy/default/omarchy/omarchy-menu.jsonc`
- `~/.config/omarchy/extensions/omarchy-menu.jsonc`

The user file is merged over the packaged defaults in the same order as the
Omarchy Shell menu. As a result, menu additions, removals, renamed commands,
visibility conditions, and local overrides are picked up automatically after
an Omarchy update. Reopen the extension to reload the files.

Omarchy's dynamic font and power-profile providers are rendered natively.
Shell-only providers such as Apps, which Vicinae already handles globally, use
a deterministic fallback that opens their submenu in the native Omarchy menu.

## Requirements

- Omarchy 4 or newer with the Quickshell menu definition
- Vicinae
