# AI Token Usage

Token usage, cost and limits for Claude Code, OpenCode and Codex in Vicinae. Open it by typing `tmon`.

- **Today, last 7 days, this month:** tokens and cost, broken down by tool and model.
- **Limits:** Claude Code 5-hour and weekly windows with reset countdowns; OpenRouter credit balance and API-key limit.
- **Your share of a shared OpenRouter key:** your own requests (from local logs) against the whole key's spend.
- **Claude value:** this month's Claude usage at list prices as a multiple of what you pay (set the price in preferences).
- **By Project:** this month's sessions per project, with session titles.
- **Fresh data:** a background command refreshes every 5 minutes; while `tmon` is open it updates within seconds of new usage.

Inspired by [Token Monitor](https://github.com/Javis603/token-monitor), and follows its data sources and refresh timings.

## Requirements

[tokscale](https://github.com/junhoyeo/tokscale) 4.22.0 or newer on the PATH Vicinae starts with:

```sh
bun add -g tokscale   # or: npm install -g tokscale
```

The extension shows these instructions when tokscale is missing or too old.

## What it reads and runs

- **Usage and cost:** `tokscale` (local logs, list prices).
- **Claude limits:** `tokscale usage`; when that has no Claude data, `claude -p /usage` (the Claude Code CLI). The extension never reads or writes Claude's credentials file.
- **OpenRouter:** `https://openrouter.ai/api/v1/credits` and `/api/v1/key`, with the key from `OPENROUTER_API_KEY` or the optional "OpenRouter API Key" preference. The key is never cached or logged.
- **Session titles and projects (read-only):** Claude Code's `~/.claude/projects`, Codex's `state_*.sqlite`, OpenCode's `opencode.db`.

Limit requests are throttled to one per 5 minutes, and a failed provider is not retried for 15 minutes, because the Claude usage endpoint rate-limits aggressively.
