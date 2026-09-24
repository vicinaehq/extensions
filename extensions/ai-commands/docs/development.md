# Development

```sh
npm run check
npm run build -- --out dist
node scripts/check-build.mjs dist
node scripts/check-setup-ui.mjs dist
npm run smoke
```

`check` validates the manifest and runs TypeScript and deterministic tests. `smoke` lists installed harness models without generating text. `npm run smoke -- claude --generate` (or `codex` / `grok` / `opencode`) sends a dummy translation request and consumes normal account usage.

Process-lifetime tests terminate a disposable extension host with SIGTERM and SIGKILL and verify that its CLI and a child process that ignores SIGTERM stop. The fixtures use no provider credentials or network requests.

API tests use a local HTTP server and dummy keys. They exercise authenticated request headers, dynamic catalogs, model/thinking parameters, UTF-8 streaming, provider errors, rate limits, cancellation, and truncated/refused responses. No real API keys or billable direct API calls were available during development. These tests verify the integration protocol; a live provider check is still needed to confirm account access and model-specific acceptance.

When a key becomes available, export the appropriate `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `XAI_API_KEY` in your terminal. Run `npm run smoke:api -- openai-api` (or `anthropic-api` / `xai-api`) to check the catalog. Add `--generate --model MODEL_ID` to explicitly make one billable dummy translation request. Never put keys in tracked files.

Codex generation ignores user agent configuration and uses its normal saved login. Catalog discovery explicitly selects the built-in OpenAI provider. An explicit `model_catalog_json` override is rejected because it supplies a custom catalog rather than current subscription models.

Vicinae bundles entrypoints as CommonJS. The Claude SDK must retain ESM semantics, so npm installation and the local build copy its unchanged `sdk.mjs` and notices into generated assets and load it with a computed dynamic import. The npm `postinstall` also prepares assets when the Store runs `vici build` directly. Do not replace this with a static runtime SDK import: its `createRequire(import.meta.url)` will crash inside a CommonJS bundle.

Native form text fields use `defaultValue`, and saving reads `Form.Values`. This avoids controlled-input focus/value synchronization problems observed with the target Vicinae build.

The extension code is MIT licensed. Dependencies, particularly the Claude Agent SDK, retain their own licenses and terms; the SDK's license and notices accompany the generated asset. No provider CLI binaries are bundled. Store updates are submitted as pull requests to `vicinaehq/extensions`. Keep the source in `extensions/ai-commands` synchronized with this repository.

## Process cleanup

Each CLI runs through `assets/process-supervisor.cjs`, using the Node.js runtime already running the extension. The supervisor owns a separate CLI process group. It watches an IPC channel whose other endpoint belongs to the extension runtime. Runtime exit or SIGKILL closes that endpoint, and the supervisor kills the CLI group. Cancellation sends SIGTERM, then SIGKILL after one second. Successful CLI exit also removes remaining processes in that group.

Claude SDK calls use its custom spawn hook. Codex and Grok generation, RPC model discovery, and the OpenCode server use the same supervisor. Processes that deliberately create a separate session or process group fall outside group cleanup.

## Setup tests

Setup tests use temporary home, configuration, and data directories. They cover first install, repeated setup, restart status, partial backup writes, interrupted setup and recovery, write failures and rollback, UWSM preservation, malformed settings, linked paths, changed backups, and service matching.

The packaged UI check loads the actual built Setup command with a React test renderer. Vicinae UI and storage calls and service commands are substituted; file operations use real temporary directories. It clicks Enable Root Search, checks command entries, queues a simulated restart, and verifies enabled and error states. It does not restart the developer's running Vicinae.
