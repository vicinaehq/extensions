# vicinae-zoxide

A zoxide directory jumper for Vicinae with configurable per-program shortcuts.

## Install

From this repo:

```
vici develop
```

Requires `zoxide` on `PATH`. If your `zoxide` lives somewhere unusual (e.g. `~/.local/bin`),
set the `extraPath` preference to a colon-delimited prefix that includes its directory.

You will also need to drop a 512x512 `extension-icon.png` into `assets/` before publishing;
Vicinae tolerates a missing icon during local `vici develop` sessions.

## Preferences

All preferences are optional textfields.

| name | default | purpose |
|---|---|---|
| `terminal` | autodetect | terminal emulator command (kitty, alacritty, wezterm, foot, gnome-terminal, ...) |
| `editor` | `code` | editor command, bound to `ctrl+e`. Set to `-` to disable. |
| `fileManager` | `xdg-open` | file-manager command, bound to `ctrl+f` |
| `program1Cmd` .. `program5Cmd` | unset | extra program slots, bound to `ctrl+1` .. `ctrl+5` |
| `program1Label` .. `program5Label` | unset | display label for each slot; falls back to the command name |
| `extraPath` | unset | colon-delimited PATH prefix used to find the `zoxide` binary |

A `programN` slot only appears in the action panel when its `programNCmd` is non-empty.

## Default keybinds

| keys | action |
|---|---|
| `Enter` | open in terminal (cwd = entry path) |
| `ctrl+e` | open in editor |
| `ctrl+f` | open in file manager |
| `ctrl+1` .. `ctrl+5` | open with user program slots 1..5 |
| `ctrl+c` | copy path to clipboard |
| `ctrl+x` | remove entry from zoxide database |

## Why this exists

This is a clean rewrite, not a port of the existing Raycast `raycast-zoxide` extension. The
upstream pipes zoxide through `fzf --exact` and lets the launcher run a literal title-substring
match on top, which breaks intuitive parent-fragment searches like typing `rkit` to find
`/home/me/repos/rkit`. This extension drops `fzf` entirely and feeds path tokens straight into
Vicinae's native fuzzy filter via `List.Item.keywords`. See `SPEC.md` for the full design.
