# Development

## Local checks

Use Node.js 22+ and npm:

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build -- --out dist
```

The isolated build writes to `dist/` without replacing an installed extension.
`npm run dev` uses the official `vici develop` watcher; `npm run build` installs
locally. Both installation and development can replace an existing local Bang.
The SDK generates `vicinae-env.d.ts`; it and build/dependency directories are ignored.

If an installed manifest needs rescanning, the SDK's development refresh hook is:

```sh
vicinae deeplink 'vicinae://api/extensions/develop/refresh?id=bang'
```

Then reselect Bang in Settings and reopen the command. Avoid temporarily removing
an installed extension during replacement: Vicinae can prune provider preferences
when it detects removal.

## Tests

Node's test runner and `tsx` run parser, reader, search, privacy, execution,
history-write, alias, SDK UI and standalone production-bundle regressions.
The UI tests mount real SDK components with a mock host. The bundle test builds
with the official CLI, then loads with only host-provided externals available.
Keep it: a package's UMD entry previously hid dependency-relative requires from
the bundler. `jsonc-parser` is deliberately imported through its ESM entry.

Tests use synthetic commands and disposable history/config files. They never run
imported personal history or open desktop terminals. Real Bash/Zsh/Fish execution
tests run only when the shell is installed. Isolated PTY tests use Python 3 and
explicitly skip if it is absent. Python is not a runtime dependency of Bang.

The opt-in desktop tests **open visible terminals**:

```sh
npm run test:terminals
npm run test:terminals -- --approval
```

They exercise installed xdg-terminal-exec, GNOME Terminal, Konsole, Kitty, Foot
and Alacritty commands using synthetic markers. The second mode asks you to
approve terminal closing. Missing emulators are reported as skips.

Before releasing, use disposable histories to check search/highlighting, raw
edit/copy text, canceled execution, the review/confirmation preferences, saved
commands after reload, fast/failed command output, and alias setup cancellation
and conflicts. Include selected-row contrast and accessibility in native UI
checks. Capture screenshots only with synthetic commands and no personal paths.
Do not equate SDK/mock tests with native desktop certification.

Local testing has covered Bash/Zsh and GNOME Terminal on GNOME Wayland. Real Fish
execution, alternative emulators, X11 and screen-reader behavior have not been
certified; do not advertise them as tested without running those checks.

## Execution boundary

`src/lib/execution.ts` validates input and settings, optionally confirms, then
creates an action-scoped handoff. `src/lib/handoff.ts` serves one payload over a
Unix-domain socket in a mode-0700 temporary directory. It expires after 30 seconds
and is removed after consumption. A crash can leave an empty socket directory,
not a command-bearing temporary script. Keep the view alive until handoff.

The official `runInTerminal` API launches the current Node runtime with
`assets/run-command.cjs` and the socket path. Only these paths enter launch argv:
Vicinae 0.30.0 logs terminal arguments. The runner receives command text in memory,
enforces the working directory, and starts the selected shell with
`["-c", command]`, inherited terminal stdio and no outer shell. Pipes, redirects,
substitutions and multiline syntax are interpreted once by that shell.

The shell is non-interactive and not a login shell. Session-only aliases and
functions are unavailable; normal shell startup behavior still applies, such as
Zsh `.zshenv` or Bash `$BASH_ENV`. Execution is not sandboxed. Shell/OS auditing
and the command itself can reveal or transmit its text despite Bang's own
logging restrictions. Development protocol traces can also contain UI/IPC data.

After exit, the runner optionally appends native history and waits for Enter on
its controlling terminal, preserving the command's exit status. It sends
`hold:false` to Vicinae to avoid a second emulator-specific close prompt. A
history-write failure warns without rerunning the command or changing its status.
There is no persistent service, TCP listener or automatic launch retry.

## History behavior

- Async reads inspect at most the newest 4 MiB. Partial first records and obvious
  unfinished final writes are skipped; detected file changes require reload.
  Snapshot checks are not a transactional lock shared with every shell writer.
- Timestamped Bash records preserve multiline boundaries. Untimestamped history
  can recover only physical lines and explicit backslash continuations. For
  native Bash to recall timestamped multiline entries together, configure
  `HISTTIMEFORMAT=''` (or a display format) before reading history.
- Zsh plain/extended history handles Meta bytes, escaped colons/newlines and
  trailing-backslash padding. Fish's custom escaping and `when` metadata are
  parsed directly, not through a general YAML evaluator.
- UTF-8, BOM and CRLF are tolerated. Invalid bytes become replacement characters;
  affected commands must be edited before running. Invalid encoding, hidden
  controls/bidi formatting and commands above 64 KiB are blocked at execution.
- Deduplication preserves exact text, latest file order and frequency. The
  lowercase search index is cached per snapshot; typing never rereads history.
- Saving appends native records after exit, before the close prompt. Missing
  files are created mode 0600 if their parent exists; existing contents and
  permissions are not rewritten. Unsupported/incomplete files fail conservatively.
- Saving bypasses shell session filters, including leading-space privacy rules.
  Users must disable Save for private commands. Active shells can overwrite
  history; append-only writes cannot coordinate all shell lock/rotation schemes.
- Other sessions may need `history -n` (Bash), `fc -RI` (Zsh), or `history merge`
  (Fish) to see newly saved records. GUI processes may lack `$HISTFILE`, `$ZDOTDIR`
  or Fish session variables; a custom History Path avoids ambiguity.

## Alias setup

SDK 0.30.0 has no alias setter or active-config-path API. The optional setup edits
`providers[providerId].entrypoints.bang.alias` in the selected JSONC file only
after separate consent. The default is
`${XDG_CONFIG_HOME:-$HOME/.config}/vicinae/settings.json`; users who launch Vicinae
with `--config` must select that file. Provider IDs use the SDK's author/assets
metadata rather than a hard-coded local installation ID.

Before replacement, setup creates an exact mode-0600 backup named
`settings.json.bang-backup-<time>-<unique-id>`. It contains the whole configuration,
possibly credentials: never commit or attach it to a report. Setup preserves
comments, unrelated values and ordinary ownership/permission bits, not custom
ACLs or extended attributes.

Existing aliases/conflicts, disabled commands, invalid/oversized/duplicate-key
configs, missing/read-only/non-owned/linked files, `imports` and
`VICINAE_OVERRIDES` are refused. Managed or ACL-dependent configurations need
manual setup. Repeated setup with the desired alias is a no-op.

The setup-only lock and concurrent-change checks do not coordinate every native
writer. Do not edit settings concurrently. Completed backups survive failures;
there is no rollback over later user changes. A stale `.bang-alias.lock` should
be removed only after checking that setup is no longer running. Successful config
replacement is normally picked up by Vicinae's watcher.

## SDK compatibility

Bang pins `@vicinae/api` 0.30.0 and React 19.1.1. Recheck these assumptions on
upgrades against the package declarations and [release source](https://github.com/vicinaehq/vicinae/tree/402695ce8ee3ed89733bbf0715578bb68350eceb):

- `List` supports controlled search and `filtering={false}`. Bang keeps its own
  ranking; native filtering must not inspect formatted title strings.
- `List.Item.title` is only a string: no public match-range API exists in this
  version. [`ListItemDelegate.qml`](https://github.com/vicinaehq/vicinae/blob/402695ce8/src/server/src/ui/qml/list/ListItemDelegate.qml)
  uses Qt Quick `Text` with default `AutoText`. Escaped titles plus trusted bold/
  underline spans rely on this renderer behavior, not a guaranteed formatting API.
  The empty bold prefix forces entity decoding; nonbreaking spaces preserve shell
  whitespace. Whole graphemes are highlighted and previews are bounded. Likely
  secrets are fully redacted before formatting; action payloads remain original.
- Switching the host renderer to plain text would expose markup. The host also
  uses the title as its accessible name, with no separate plain label. Recheck
  rendering and screen-reader behavior on upgrades. See [Qt's text format documentation](https://doc.qt.io/qt-6/qml-qtquick-text.html#textFormat-prop).
- `runInTerminal` accepts an argument array and uses Vicinae's internal
  xdg-terminal-exec-compatible desktop entry resolution. It does not expose a
  per-call emulator override. Core returns a launch-success boolean, but this
  TypeScript wrapper discards it: report “launch requested,” not verified execution.
- Exact aliases fast-track on Space; fallbacks deliver `fallbackText` only on
  activation. There is no extension root-query subscription/live prefix provider.
  Live `!query` would need an upstream opt-in prefix-to-view hook, explicit route
  approval and collision handling—not a global key hook. Such a hook should test
  paste/typing, Escape/Backspace, disabled targets and zero automatic execution.

History format references: [Zsh history implementation](https://github.com/zsh-users/zsh/blob/master/Src/hist.c)
and [Fish history serialization](https://github.com/fish-shell/fish-shell/blob/master/src/history/yaml_backend.rs).

## GitHub and store publication

A standalone GitHub repository hosts the source; it does not install Bang into
the Vicinae store. Keep `private: true` in the npm manifest to prevent accidental
npm publishing. Confirm the GitHub owner/name, visibility and manifest attribution
before creating or pushing a remote. Do not include generated files, local data
or configuration backups. Add real screenshots with synthetic data when available;
do not substitute a mock image for an actual extension screenshot.

For store submission, follow the current [community repository instructions](https://github.com/vicinaehq/extensions#submit-your-extension),
[review rules](https://github.com/vicinaehq/extensions/blob/main/skills/extension-reviewer/SKILL.md)
and [complete rule catalog](https://github.com/vicinaehq/extensions/blob/main/skills/extension-reviewer/rules.json).
Submit a separately approved PR adding the source under `extensions/bang`, with
the MIT license, manifest, assets and consistent npm lockfile. Run upstream
`bun scripts/validate-extension.ts bang` and its CI as well as local checks.
Local `vici lint` is not a substitute for repository validation or semantic review.
Merging the PR automatically publishes to the store.

Documentation structure follows the community's [Custom Commands](https://github.com/vicinaehq/extensions/tree/main/extensions/custom-commands)
and [Bluetooth](https://github.com/vicinaehq/extensions/tree/main/extensions/bluetooth)
examples: clear purpose, explicit dependencies, usage/preferences and local build
instructions. The community repo currently has no `AGENTS.md`; Bang's contributor
guidance is specific to this codebase, not a purported upstream template.
