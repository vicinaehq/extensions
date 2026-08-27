![Limit Tracker — Vicinae Extension](metadata/banner.png)

# Limit Tracker

> Track AI coding agent limits across **Claude, Codex, Copilot, Cursor, DeepSeek, Gemini, OpenCode Go, and z.ai** — directly from [Vicinae](https://vicinae.com).

Limit Tracker is a **native Vicinae extension** (built with `@vicinae/api`, TypeScript and React). It shows each provider's plan, 5-hour and weekly limits, a live countdown to reset, per-model Claude windows, and the Codex manual-reset credit bank — in a clean master-detail list.

---

## Preview

![OpenCode Go — 5h / Weekly / Monthly with live Resets In](assets/preview-opencode-go.png)
*Screenshot: OpenCode Go detail with standardized 5h/Weekly/Monthly limits and live Resets In — same layout as Claude/Codex.*

---

## Why

- **Plan around resets.** Per-provider 5-hour and weekly windows with live countdowns to the next reset — stop guessing whether to start that long task.
- **See everything at a glance.** Plan, limits, reset time, per-model Claude windows, and Codex reset credits — all in one place.
- **Privacy-first.** Reuses existing provider sessions — OAuth, API keys, browser cookies, local files — no passwords stored.
- **Lightweight.** Native Vicinae extension, no background processes, minimal UI.

---

## Install

### Requirements
- [Vicinae](https://vicinae.com) installed (v0.27.1+).
- [Node.js](https://nodejs.org) (the app embeds its own Node runtime; the CLI uses your system Node).
- The `vici` CLI (ships with `@vicinae/api`). Make sure `vicinae.exe` is on your `PATH`
  (default: `C:\Users\<you>\AppData\Local\Programs\Vicinae\bin`).

### Build & install
```bash
# 1. install dependencies
npm install

# 2. type-check + run the test suite (no app required)
npm run typecheck      # tsc --noEmit
npm test               # node --test --experimental-strip-types

# 3. build the extension
npm run build          # -> outputs to Roaming\vicinae\extensions\limit-tracker

# 4. (Windows) copy the bundle where the app actually loads it
#    and remove the Roaming copy so it isn't listed twice
rm -rf "$LOCALAPPDATA/vicinae/data/extensions/limit-tracker"
cp -r  "$APPDATA/vicinae/extensions/limit-tracker" "$LOCALAPPDATA/vicinae/data/extensions/limit-tracker"
rm -rf "$APPDATA/vicinae/extensions/limit-tracker"
```

Then open Vicinae (Alt+Space) and search for **"Usage"**.

### Development
```bash
npm run dev            # vici develop (watch mode)
```
On Windows, `vici develop` writes to `Roaming` — copy to `Local\data` as in step 4 above.
On Linux/macOS the dev flow works directly.

---

## Providers

- **Claude** — OAuth API; 5-hour, weekly, and per-model (Sonnet, Opus, etc.) limits with individual reset timers.
- **Codex** — OAuth API; 5-hour, weekly, code review limits, credits, and manual-reset credit bank.
- **Copilot** — Reads an existing GitHub token from your environment or extension preferences and queries the internal usage API.
- **Cursor** — Browser session cookies for plan + usage + billing resets.
- **DeepSeek** — API key for credit balance tracking.
- **Gemini** — OAuth-backed quota API using Gemini CLI credentials.
- **OpenCode Go** — Usage API for subscription tracking.
- **z.ai** — API token for personal/team quota, 5-hour, and hourly usage windows.

> **Phase 2** (not in v1): `aihubmix`, `amp`, `antigravity`, `clinepass`, `droid`, `grok`, `kimi`, `minimax`, `minimaxcn`, `synthetic` — fora do registry até a v1 estabilizar (ver `../../phase-2` local).

---

## Features

- **Master-detail UI:** a clean agent list on the left, with a detail panel on the right showing plan, limits and reset time.
- **Live reset countdown:** "Resets In" ticks down in real time (days / hours / minutes — no seconds), for both Claude and Codex.
- **5-hour & weekly limits:** percentage remaining with a progress bar, per provider.
- **Claude per-model windows:** each `seven_day_*` / `weekly_scoped` model (e.g. Sonnet) shown as its own section with its own reset timer.
- **Codex reset-credit bank:** "Limit Reset Credits" (manual resets available) with expiry, when present.
- **Progress rings:** each list row shows a circular usage ring.
- **Toggle providers:** enable/disable any provider from the extension preferences (Settings → Limit Tracker).
- **Menu-bar mode:** a second command shows the same data in the menu bar and refreshes hourly.
- **Smart refresh:** debounce + cooldown to prevent rate limits (429 errors).
- **Configurable cache:** TTL for remote API requests (default 180s; 0 disables caching).

---

## Preferences

Open **Vicinae Settings → Limit Tracker** (or press <kbd>⌘</kbd>+<kbd>,</kbd> inside the command):

| Preference | Type | Description |
| --- | --- | --- |
| Show Claude | checkbox | Show Claude usage in the list |
| Show Codex | checkbox | Show Codex usage in the list |
| Show Copilot | checkbox | Show Copilot usage in the list |
| Show Cursor | checkbox | Show Cursor usage in the list |
| Show DeepSeek | checkbox | Show DeepSeek balance in the list |
| Show Gemini | checkbox | Show Gemini usage in the list |
| Show OpenCode Go | checkbox | Show OpenCode Go subscription in the list |
| Show z.ai | checkbox | Show z.ai (GLM) usage in the list |
| Additional Codex Homes | textfield | Comma-separated `CODEX_HOME` dirs beyond the default |
| Copilot Authorization Token | password | Optional fallback OAuth token (auto-detected from `GH_TOKEN`/`GITHUB_TOKEN`) |
| Cursor Cookie Header | password | Optional fallback Cookie header (auto-detected from Cursor login) |
| DeepSeek API Key | password | Optional API key (auto-detected from OpenCode / `DEEPSEEK_API_KEY`) |
| OpenCode Go API Key | password | Your OpenCode Go API key |
| z.ai API Token | password | Optional token (auto-detected from `ZAI_API_KEY`/`GLM_API_KEY`) |
| Cache Duration (Seconds) | textfield | TTL for remote API requests (default `180`; `0` disables caching) |

Providers without credentials configured show **Not Configured** — that's expected.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| <kbd>Enter</kbd> | Refresh all visible providers |
| <kbd>⌘</kbd>+<kbd>R</kbd> | Refresh all visible providers |
| <kbd>⌘</kbd>+<kbd>,</kbd> | Open extension preferences |

---

## Project structure

```
limit-tracker/
├── package.json              # Native Vicinae manifest (NO "type":"module"; has "author")
├── assets/                   # Icons (limit-tracker-icon.svg + per-provider SVGs/PNGs)
├── src/
│   ├── agent-usage.tsx        # Main list-view command (registry: AGENT_REGISTRY)
│   ├── agent-usage-menubar.tsx # Menu-bar command
│   ├── agents/
│   │   ├── types.ts           # Shared types (AgentDefinition, UsageState, CoreAgentId)
│   │   ├── ui.tsx             # Detail/Accessory helpers (progress ring, list icons)
│   │   ├── countdown.tsx      # LiveResetLabel (live "Resets In" countdown)
│   │   ├── format.ts          # Shared formatting (formatDuration, formatClock)
│   │   ├── hooks.ts           # Cached-hook factories (TTL cache)
│   │   ├── provider-hooks.ts  # All provider hook wirings
│   │   └── usage-cache.ts      # Pure cache helpers (tested)
│   ├── accounts/              # Multi-account storage (Codex, z.ai)
│   ├── claude/  codex/  copilot/  cursor/  deepseek/  gemini/  opencode-go/  zai/  # core 8 (v1)
│   │   └── fetcher.ts renderer.tsx types.ts   # per-provider logic
│   └── **/*.test.ts           # Node test-runner tests (colocated)
├── WINDOWS-TEST.md            # Windows 0.27.1 build/install gotchas
├── LINUX-TEST.md              # Linux validation guide
└── README.md
```

---

## How it works

- Each provider has a **fetcher** (reads local credentials / calls the provider API), a **renderer**
  (formats the detail panel), and a **hook** that wires it into the list with TTL caching.
- Fetchers are pure (no `@vicinae/api` import) so they run under the Node test runner.
- The list shows a progress ring + name; selecting a row shows the detail panel with plan, limits,
  and a live reset countdown.

---

## Testing

```bash
npm run typecheck
npm test
```

Expected: `tsc --noEmit` clean, `node --test` **0 failures**.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository.
2. Create a feature branch.
3. Run `npm run typecheck` and `npm test` before committing.
4. Open a pull request with a clear description of your changes.

---

## Acknowledgments

This project was inspired by and builds upon the work of several open-source projects:

- **[Raycast Agent Usage](https://github.com/nicoprocessor/raycast-agent-usage-utility)** — the original Raycast extension that inspired this project's UX and provider coverage.
- **[CodexBar](https://github.com/steipete/CodexBar)** — for the README structure and project organization reference.
- **[Vicinae](https://vicinae.com)** — for the native extension API (`@vicinae/api`) and the launcher platform.

---

## License

[MIT](./LICENSE)
