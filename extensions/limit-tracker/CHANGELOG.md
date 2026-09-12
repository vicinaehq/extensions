# Limit Tracker Changelog

## [Unreleased]

### Added

- Antigravity provider: quota snapshots per model pool (Google, Anthropic, OpenAI), read from the
  oh-my-pi (`omp`) usage history and labeled as snapshots rather than live quota.
- Command Code provider: plan, percent used and renewal date from `api.commandcode.ai`, with the key
  auto-detected from `~/.commandcode/auth.json` or `COMMANDCODE_API_KEY`.
- oh-my-pi (`omp`) harness as a fallback credential source for Claude, Codex, OpenCode Go and
  Antigravity. It is consulted only when no preference, environment variable or native login is
  available, and values sourced this way are labeled `via omp` inside the provider's own row instead
  of getting a row of their own. Tokens are read into memory and never written anywhere.
- Preference to turn the omp fallback off.

### Changed

- Standardized the 5-hour, weekly and monthly limit display so every provider renders the same way.
- Grouped provider settings in preferences and clarified what the refresh interval applies to.
- Upgraded `@vicinae/api` from 0.8.5 to 0.28.1.

### Fixed

- The macOS, Windows and Linux credential helpers built shell command strings with unescaped
  interpolation, including the refreshed OAuth token in the Windows Credential Manager call. They now
  pass argument arrays, so no credential value can alter the command that runs.
- `npm test` matched no files under Node on Windows and silently reported zero tests, hiding the
  whole suite.
- The declared platforms and the README install steps did not match the platforms Vicinae supports.

## [1.0.0] - 2026-08-27

### Added

- Initial release, tracking eight providers: Claude, Codex, Copilot, Cursor, DeepSeek, Gemini,
  OpenCode Go and z.ai.
- Master-detail list with a per-provider usage ring, and a detail panel showing plan, limits and
  reset time.
- Live "Resets In" countdown, per-model Claude windows, and the Codex manual-reset credit bank.
- OpenCode Go 5-hour, weekly and monthly windows parsed from the usage API, with per-window resets.
- Menu-bar command refreshing hourly.
- Per-provider toggles, a configurable refresh interval, and a TTL cache with refresh debounce and
  cooldown to avoid rate limits.

### Fixed

- Extension preferences open through `openExtensionPreferences()` instead of a hard-coded
  `vicinae://extension-preferences` deeplink.
- Menu-bar items use the `vicinae://launch/limit-tracker/agent-usage` deeplink form, so they actually
  open the Agent Usage command.
- OpenCode Go reports a parse error when the response carries no usable quota, instead of inventing
  empty windows that rendered as a healthy 100% remaining.
- Multi-account Codex and z.ai rows render their error message instead of only generic metadata.
- Refreshing no longer repeats the same request once per account row of a multi-account provider.
- The Copilot documentation described a GitHub device flow that was never implemented; it reads an
  existing token from the environment or preferences.
