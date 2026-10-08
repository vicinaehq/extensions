# Niri Actions

A [Vicinae](https://github.com/vicinaehq/vicinae) extension to browse and run
[niri](https://github.com/niri-wm/niri) IPC actions with fuzzy search.

## Disclaimer

This extension was largely LLM generated, using GLM-5.3 and opencode, except for this README.

I have been using the extension daily for a few weeks and is stable.

## Features

- **Almost all IPC actions**: Every action accepted by `niri msg action` (windows, columns,
  workspaces, monitors, screenshots, overview, system), grouped into sections. Actions with free-form arguments that
  cannot be enumerated (`spawn`, `spawn-sh`,
  `set-workspace-name`, `stop-cast`) are intentionally not listed; use a terminal or
  niri key bindings for those.
- **Fuzzy search**: The fuzzy search is free from Vicinae's built-in list filtering; descriptions are
  indexed as keywords so you can search by what an action does, not just the name
- **Action arguments**: Actions that take arguments are expanded into concrete
  items:
    - workspace references come from `niri msg --json workspaces` (indices up to the
      highest current index plus one, plus named workspaces)
    - monitor actions list your actual outputs (`niri msg --json outputs`)
    - window actions list your open windows by title/app id (`niri msg --json windows`)
    - size changes offer fixed increments (`SIZE_CHANGES = ["+10%", "-10%", "50%", "100%"]`)

## Requirements

- A running niri session (Vicinae must be launched from within it so the niri IPC
  socket is reachable)
- The `niri` executable in `PATH`

## Usage

1. Open Vicinae search and type `niri`
2. Select **Niri Actions**
3. Fuzzy-search for an action, e.g. `move workspace up`
4. Press `Enter` to run it

## Development

Install dependencies and run the extension in development mode:

```bash
npm install
npm run dev
```

To build the production bundle:

```bash
npm run build
```
