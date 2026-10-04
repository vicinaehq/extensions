# Abendrot

Vicinae extension for [Abendrot](https://abendrot.app), the macOS menu-bar app that warms your displays around sunset.

Every command drives the official `abendrot` CLI with `--json`, so the extension changes nothing the CLI could not do from a terminal. The CLI binary is resolved from `PATH` first (the Homebrew cask symlinks it), falling back to `/Applications/Abendrot.app/Contents/Helpers/abendrot`.

## Commands

| Command | CLI | What it does |
| --- | --- | --- |
| Abendrot Status | `status --json` | Read-only view: warming, schedule, warmth, per-display method, excluded apps |
| Set Warmth | `set warmth` | Set warmth as a strength (`0.0`-`1.0`) or Kelvin target (`500`-`6500`) |
| Enable Warming | `on` | Turn warming on |
| Disable Warming | `off` | Turn warming off |
| Toggle Warming | `get enabled` + `on`/`off` | Flip the master toggle |
| Reveal True Color | `reveal` | Momentary true-color peek, optional hold `0`-`300` seconds |
| Toggle Cozy Mode | `get cozy` + `cozy on/off` | Flip cozy mode (expanded warmth) |
| Quit Abendrot | `osascript` | Quit the menu-bar app gracefully |

## Requirements

- Abendrot installed: `brew install --cask matthewrball/tap/abendrot`, or the `.dmg` from [abendrot.app/download](https://abendrot.app/download/).
- The app itself, so `reveal` has something running to talk to (`status`, `enable`, `disable`, `toggle`, and `set warmth` also work while the app is closed; changes are persisted and applied on next launch).

## Development

```sh
npm install
npm run lint
npm run build
npm test
```

`npm test` runs the parsing checks for the warmth argument (`node --test`).

## Icon

`assets/abendrot-icon.png` comes from the [Abendrot repository](https://github.com/matthewrball/abendrot), MIT licensed.