# Ghostty for Vicinae

Control [Ghostty](https://ghostty.org/) from Vicinae on Linux.

## Commands

- **New Ghostty Window** — opens a new Ghostty window.
- **New Ghostty Tab** — focuses Ghostty and sends `Ctrl+Shift+T` to create a tab.
- **Focus Ghostty Window** — lists visible Ghostty windows and focuses the selected one.
- **Open Ghostty Launch Configuration** — runs saved YAML launch configurations.
- **Open Ghostty Workspace** — scans a parent directory for Git repositories and opens one in Ghostty.
- **Open with Ghostty** — opens a provided path in Ghostty.
- **Manage Ghostty Config** — view, edit, validate, and open your Ghostty config file.

## Requirements

- Ghostty installed and available at `/usr/bin/ghostty`, or set the **Ghostty Binary** preference.
- `wmctrl` for focusing Ghostty windows.
- KDE/KWin `qdbus` plus `ydotool` for the **New Ghostty Tab** command on Wayland.

Ghostty does not currently expose a stable Linux CLI action for creating a tab in an existing window. This extension therefore focuses Ghostty and sends the standard Ghostty new-tab shortcut (`Ctrl+Shift+T`). If that is not available, the command opens Ghostty and shows a failure toast.

## Launch configurations

Launch configurations are YAML files stored in:

```text
~/.config/vicinae/ghostty-launch-configs
```

Example:

```yaml
name: dev
windows:
  - tabs:
      - title: Shell
        cwd: ~/Developer/my-project
        commands:
          - pwd
          - git status
```

Commands in launch configurations are executed in Ghostty with `&&`. Only use launch configurations you trust.

## Preferences

- **Workspaces Parent Directory** — parent directory to scan for Git repositories. Defaults to `~/Developer`.
- **Workspace Scan Depth** — maximum depth for repository scanning.
- **Ghostty Binary** — path to the Ghostty executable.

## Notes

The window focus command uses `wmctrl`, which may be limited on some Wayland compositors. KDE Plasma works best because the tab command can use KWin scripting to focus Ghostty before sending the shortcut.
