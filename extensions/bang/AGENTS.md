# Bang contributor guidance

Bang is a Linux Vicinae extension for searching local shell history and
deliberately running commands in a visible terminal. Read `README.md` and
`docs/DEVELOPMENT.md` before changing behavior.

## Project layout

- `src/bang.tsx`: command view, search, editor and action wiring.
- `src/alias-setup.tsx`: opt-in alias setup form.
- `src/lib/`: history parsing/reading, ranking, title formatting, preferences,
  alias configuration and execution/IPC boundaries.
- `assets/run-command.cjs`, `assets/history.cjs`: auditable terminal-side runner
  and native history serialization; these are source, not generated bundles.
- `tests/`: Node tests, synthetic fixtures and opt-in desktop smoke tests.
- `package.json`: extension manifest, preferences and npm scripts.

## Conventions

- Use idiomatic, strictly typed TypeScript and the existing React/SDK patterns.
  Keep pure history/search logic separate from UI, filesystem and execution code.
- Keep dependencies light. Verify APIs against the pinned `@vicinae/api`
  declarations and upstream source; prefer supported SDK APIs over native tools.
- Match existing naming and formatting. Add regression tests for behavior changes.
- Keep the README user-focused. Put architecture and compatibility details in
  `docs/DEVELOPMENT.md`; do not reintroduce dated task boards or completion logs.
- Do not download/install system tools, change shell configuration, or modify
  the user's installed extension/settings without explicit approval. Missing
  optional test tools should be reported as skips, not installed automatically.

## Safety invariants

- Render, search, import, hover and selection must never execute commands.
  Only explicit Run may cross the execution boundary. Review and confirmation
  are independent preferences, both default on.
- Preserve original text for edit/copy/run. Escape all command text before
  adding trusted highlight markup, and fully redact likely-sensitive previews.
- Never log command contents or include them in raw error toasts, terminal-launch
  argv or temporary scripts. Preserve the private, one-use IPC handoff and timeout.
- Pass shell syntax only as a direct argument to the selected shell's `-c`;
  never interpolate history into an outer shell command. Use the official
  `runInTerminal` API for a visible terminal; no silent execution or retries.
- History saving is explicitly configurable and append-only. Never truncate or
  rewrite the user's history. Test writes must use disposable fixture paths.
- Alias setup must remain opt-in with separate consent, a private exact backup,
  conflict checks and conservative handling of unsupported/concurrent configs.
- Keep reads asynchronous and bounded; rebuild the search index only on a new
  snapshot, not on every keystroke. Do not add telemetry, global key hooks, a
  persistent daemon or an LLM.
- Do not claim live root `!query` routing or native highlight-range APIs exist.
  Reverify the documented renderer/config workarounds on SDK upgrades.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build -- --out dist
```

Use an isolated build for routine checks: plain `npm run build` replaces the
local installation. Keep the production-bundle regression test; source imports
alone do not catch packaging failures. Report missing-shell/Python skips honestly.
Run `npm run test:terminals` only with permission: it opens desktop terminals.
Use synthetic data for manual UI, highlighting, copying and alias tests; never
include real history, configuration backups or protocol traces in reports.

Creating/pushing a GitHub repository, opening a community PR, or publishing a
release requires explicit user approval. GitHub source hosting and Vicinae store
publication are separate operations.
