# Niri Monitor Manager

Manage your connected displays without leaving the launcher. Turn monitors on or off, switch resolutions, adjust scale, and rotate a display — all from a single command, built for the [niri](https://github.com/niri-wm/niri) window manager.

## Features

- See every connected monitor at a glance, with its model, resolution, refresh rate, current rotation, and scale
- Make quick, one-off changes that apply immediately and reset on restart
- Save settings that persist across restarts, written directly to your niri config
- Turn any monitor on or off
- Power off every monitor at once
- Copy a monitor's name, model, or resolution to the clipboard

## Requirements

- [niri](https://github.com/niri-wm/niri) as your Wayland compositor
- The `niri msg` command available on your `PATH` (installed automatically with niri)

## Usage
Run **Monitor Settings** to see a list of your connected displays. Each row shows the monitor's current rotation and scale at a glance, so you can check your setup without opening the action panel.
Run **Manage Monitors** to see a list of your connected displays. Each row shows the monitor's current rotation and scale at a glance, so you can check your setup without opening the action panel.

Select a monitor to choose between two ways of changing its settings:

### Quick actions

Runtime-only changes that apply instantly via `niri msg` and reset the next time niri restarts. Good for testing a setting or a temporary change.

| Action                   | Shortcut          |
| ------------------------ | ----------------- |
| Enable / disable monitor | `Cmd + D`         |
| Set scale                | `Cmd + S`         |
| Rotate display           | `Cmd + R`         |
| Set resolution           | `Shift + R`       |
| Refresh list             | `Cmd + Shift + R` |
| Power off all monitors   | `Cmd + Shift + P` |
| Copy monitor name        | `Cmd + C`         |
| Copy model               | `Shift + C`       |
| Copy resolution          | `Cmd + Shift + C` |

The enable/disable action only appears when more than one monitor is connected, since you can't disable your only display.

### Edit Persistent Settings

Opens a form to set resolution, scale, rotation, and (with more than one monitor connected) enabled state. Submitting asks for confirmation, then writes an `output "<name>" { ... }` block into your niri config file — creating it if one doesn't exist yet, or updating just that monitor's block if it does. Everything else in your config file is left untouched.

niri live-reloads its config on save, so the change applies immediately with no restart needed. If the write ever produced invalid config, niri keeps your last working configuration and shows its own notification rather than breaking your session.

## How it works

Quick actions run entirely through niri's IPC interface (`niri msg`). Persistent settings are written straight to your niri config file, found in the same place niri itself looks: the `$NIRI_CONFIG` environment variable if set, otherwise `$XDG_CONFIG_HOME/niri/config.kdl`, falling back to `~/.config/niri/config.kdl`.

## Limitations

- Disabled monitors don't show a resolution, scale, or rotation, since niri has no logical output to report for them.
- Custom resolutions or refresh rates outside what your monitor reports aren't supported — only modes niri already knows about.
- If an output block in your config has been disabled with a `/-` comment, persistent settings will still edit inside it rather than recognizing it's commented out.

## Development

```bash
npm install
npm run dev    # Development mode
npm run build  # Production bundle
```
