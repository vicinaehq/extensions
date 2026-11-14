# Claude Code & Codex tmux Sessions for Vicinae

Vicinae extension for finding and switching between tmux panes running Claude Code or Codex. It
highlights Claude Code sessions waiting on you, then switches the most recently active tmux client
to the selected pane and focuses its terminal window in Hyprland or i3.

## How it works

- **Claude Code status** comes from `claude agents --json`, Claude Code's scripting interface. Interactive
  sessions report `status` (`busy`, `waiting`, `idle`) and, while waiting, `waitingFor`
  (`permission prompt`, `input needed`, `sandbox request`, `worker request`, `dialog open`).
- **Codex sessions** are discovered from interactive `codex` processes. Codex has no equivalent
  scripting status API, so these are listed as Status Unknown. Codex's stored session history is
  never read or scanned; closed sessions add no file I/O or list-processing cost.
- **Pane mapping** walks each Claude Code or Codex process's parent chain (`/proc/<pid>/stat`) up to a
  `#{pane_pid}` from `tmux list-panes -a`. Window names are only displayed, never matched. A Claude
  process nested inside another one (e.g. `claude -p` run from a Bash tool call) is skipped.
- **Refresh**: the list re-reads on every change in `~/.claude/sessions` (Claude Code rewrites a
  per-process record there on each status change) and polls every 10 s as a fallback, which also
  picks up Codex processes and tmux-only changes such as window renames.
- **Order**: sections go Needs Attention, Working, Idle; inside each, the most recent status change
  comes first. That time is `statusUpdatedAt` from the session's record in `~/.claude/sessions`,
  an undocumented file, since `claude agents --json` exposes no activity timestamp; when the record
  is unreadable the documented `startedAt` is used instead.
- **Switching** runs `tmux switch-client -c <tty> -t <pane>` on the client with the latest
  `client_activity`, then walks that client's parent chain to a terminal window. On Hyprland it
  focuses the matching PID with `hyprctl`; on i3 it finds the matching window in the IPC layout tree
  and focuses its `con_id` with `i3-msg`.

Nothing in how Claude Code is started or configured changes: no hooks, no wrappers.

## Requirements

- Vicinae 0.28+, Claude Code with `claude agents --json` (2.1.319 tested), and/or Codex CLI, tmux 3.x
- One of:
  - Hyprland with the Lua config (0.55+) for focusing the terminal
  - i3 with its IPC enabled (the default), plus `i3-msg` and `xprop` available for focusing the terminal

## Build and install

```sh
npm install
npm run build   # installs into ~/.local/share/vicinae/extensions/claude-tmux
npm run dev     # development session with live reload and logs
```

Run it from Vicinae's root search ("Coding Agent Sessions") or bind the toggle deeplink in your compositor config:

Hyprland:

```lua
hl.bind("ALT + K", hl.dsp.exec_cmd("vicinae vicinae://launch/@coffebar/claude-tmux/claude-sessions?toggle=true"))
```

i3:

```
bindsym Mod1+k exec --no-startup-id vicinae vicinae://launch/@coffebar/claude-tmux/claude-sessions?toggle=true
```

## Limitations

- Only the default tmux server is inspected.
- With no tmux client attached there is nothing to switch, and a HUD says so.
- Sessions on other machines (over ssh) or in containers are not visible to `claude agents`.
