# AI Commands for Vicinae

Reusable text transformations using Claude Code, Codex, Grok, OpenCode, or direct OpenAI, Anthropic, and xAI APIs. Designed for Linux, with Hyprland / Wayland as the primary target.

Create a command once, select text in another app, and run the command from **AI Commands**. Review the result and press **Enter** to replace the selection.

For a separate entry for each command in Vicinae's root search, complete the [desktop integration](#desktop-integration) setup. This is optional and requires a supported user-owned Vicinae launcher. Installing the Store extension alone does not configure it.

## Install

Requires Vicinae 0.28.1 or later and Node.js 22 or later for development. Use a current CLI with an existing provider connection, or configure an API key directly in extension preferences. For CLI connections, sign in through that CLI first; the extension uses its saved login without copying account tokens. Your account must include access to the chosen CLI and model. A website subscription alone does not establish that access.

While the Store submission is under review, install from source:

```sh
git clone https://github.com/vdmkotai/vicinae-ai-commands.git
cd vicinae-ai-commands
npm ci
npm run build
```

After approval, install **AI Commands** by **vdmkotai** from Vicinae Store. Both installation methods provide the same extension.

The build installs the extension into Vicinae's local extension directory. For a separate distributable directory, use `npm run build -- --out dist` instead. Open **Check AI Harnesses** to verify executable detection and model discovery. If a CLI is installed in a custom location, set its absolute path in extension preferences.

Validated CLI baselines: Claude Code 2.1.263, Codex 0.153.4, Grok ACP 1.0.13, OpenCode 1.18.29. These integrations use current CLI features; older CLI versions may need updating.

## API keys and OpenCode

To use an API without installing a CLI, open extension preferences and fill in **OpenAI API Key**, **Anthropic API Key**, or **xAI API Key**. In your AI command choose the matching **API** entry in **Harness / API**, refresh models, and select a model. API requests use the provider's API billing; they do not use a chat subscription. Keys are stored by Vicinae as password preferences in its local storage, not in AI commands, launcher entries, or history. Password fields hide the input; they are not an encrypted OS keyring.

For **OpenCode**, connect a provider in OpenCode first, then select OpenCode in the command form. The extension reads connected models and their thinking variants from OpenCode's local HTTP API, following the same session/prompt approach as T3 Code. It starts and stops its own authenticated loopback server automatically. OpenCode returns the final answer at once; the preview stays on "Generating…" until it is ready.

Only provider/model settings are carried into OpenCode's temporary configuration. External plugins, project instructions, MCP tools, and global coding agents are excluded; permissions deny all tools. Provider integrations requiring external plugins are not supported in this mode. If managed configuration injects instructions or tools that cannot be isolated, the extension reports an error before generation. Its session database is temporary and removed after the request; normal provider credentials remain in OpenCode's own location.

## Create and run

1. Open **Create AI Command**.
2. Set its name, harness or API, model, thinking level, prompt, and optional system instruction.
3. Save with **Ctrl+Enter**. If desktop integration is configured, the command also appears in root search.
4. Select text in another application, open Vicinae, and run the saved command from **AI Commands** or its configured root-search entry.
5. Review the answer. **Enter** pastes it into the original application; **Ctrl+C** copies it.

Select a saved command in root search, open its Actions menu (**Ctrl+B** on this setup), and choose **Edit AI Command** to open its settings without running AI. Vicinae shows any assigned shortcut beside the action. Use **AI Commands** to duplicate or delete commands. Editing updates the same main-search entry; deleting removes it. **Repair Main Search Entry** recreates an entry if you removed it manually.

Prompts support two literal placeholders:

| Placeholder   | Input                                        |
| ------------- | -------------------------------------------- |
| `{selection}` | Text highlighted when the command opens      |
| `{clipboard}` | Text on the clipboard when the command opens |

Example:

```text
Translate into English. Keep my tone. Use no long dashes.
Return only the translated text, without surrounding quotes.

{selection}
```

Placeholders are substituted once in the prompt. Text inserted through a placeholder is never treated as another template. The system instruction is literal. Both sources can be used in one prompt; only referenced sources are sent to the selected harness. Missing selection produces an error instead of silently sending clipboard contents.

The native Vicinae editor displays placeholders as ordinary text. Models are loaded at runtime, not from a fixed model list. CLI thinking choices and Anthropic API capabilities come from their catalogs. OpenAI and xAI APIs do not publish per-model thinking levels: their menus show API-level options and explain that unsupported choices produce a provider error. **Provider default** omits the thinking override. **Refresh Models** reloads the catalog.

## Results and history

Results are plain text. Long lines wrap to the preview width; longer results scroll vertically. Markdown and HTML in the answer are displayed literally. Copy and paste use the original answer, unaffected by display escaping. During generation, Enter does not paste a partial answer. **Ctrl+.** cancels the request. **Ctrl+R** on a completed result opens a short refinement prompt; the previous result can be restored from the actions menu.

**AI Command History** keeps up to 100 completed runs, bounded to about five million stored characters. It stores the command, referenced input, rendered prompt, and result locally in Vicinae's extension storage. Disable **Save input and results locally** in preferences to stop saving new history. Clear existing records through the history command. History failures do not discard a completed answer.

The selected provider receives the prompt and text. Claude and Codex requests disable local session persistence; Grok currently retains its own CLI session records. Turning off extension history does not control provider-side retention or the CLI's own logs. This extension has no telemetry and does not copy authentication files.

## Desktop integration

Linux commands get desktop entries in `$XDG_DATA_HOME/vicinae-ai-commands/launcher-data/applications`, outside the normal shared application directories. They contain the command name, icon, and Vicinae invocations for Run and Edit with its ID, never the prompt or selected text. Vicinae watches this directory and indexes changes automatically. The entries still belong to Vicinae's **Applications** provider.

This setup is tested on Omarchy with a user-owned shell launcher. It does not support every Vicinae installation method. Commands still work from **AI Commands** without it.

Clone this repository and run `npm ci` if you installed from the Store. From the repository directory, configure the integration once:

```sh
npm run setup:launcher
```

Restart Vicinae through the configured wrapper. If your user service already starts `~/.local/bin/vicinae`, run:

```sh
systemctl --user restart vicinae.service
```

Then open **AI Commands** once. Existing commands are published privately before their owned legacy entries are removed from the shared applications directory. IDs remain unchanged. Subsequent saves, renames, and deletes update the private entries automatically. A migration failure reports the affected command while keeping the management list available.

The setup script targets a user-owned two-line shell launcher at `~/.local/bin/vicinae` that delegates to an absolute executable or a `$HOME` path. Pass `-- --launcher /absolute/path` to use another supported wrapper. It refuses system binaries, symlinks, custom wrapper logic, linked settings files, and an existing custom Applications Launch Prefix. It preserves JSON comments and unrelated settings, backs up the original launcher and settings under `$XDG_DATA_HOME/vicinae-ai-commands/launcher-bin`, and adds the private data path only for `vicinae server` starts. Start Vicinae through that wrapper, including its service; directly running a different binary bypasses this setup. The setup does not restart Vicinae itself or change service definitions. If your installation has only a packaged binary such as `/usr/bin/vicinae`, it is outside the automatic setup's scope. Keep using the internal command list until a suitable launcher is configured.

Applications launched through Vicinae's application provider, including desktop sub-actions and terminal launches, use a wrapper that removes the private path before preserving the normal UWSM or direct-launch behavior. This extension also removes the private path from its AI harness processes. Normal system menus outside that environment do not discover these entries. This is search-path isolation, not a sandbox: Vicinae's separate **Run executable** action in file search and unrelated extensions that spawn processes directly bypass the app launch prefix and may pass the private path to their children.

Before removing the launcher integration, restore the original launcher from `launcher-bin/vicinae-original`, remove only its managed `providers.applications.preferences.launchPrefix` setting, and restart Vicinae. Keep later unrelated settings changes; do not overwrite the current settings file with an old full backup. The original setting is recorded in the settings backup referenced by `launcher-bin/setup.json`.

The extension uses Vicinae's selection, window-management, and clipboard APIs. Before inserting, it closes the launcher, restores the original window, checks focus, and asks Vicinae to paste. Replacement works when the original editable control retains its selection and supports the platform paste mechanism. A selection in a read-only page can be transformed and copied, but cannot be replaced. Other desktops depend on their Vicinae clipboard/window backend and are not yet validated.

Some rich-text editors can move or clear their selection while focus changes. A user reported this in the X post composer, including outside this extension. If the selection has moved, reselect the intended text before pasting, or copy the result and paste manually. The extension cannot restore a browser editor's internal selection range through Vicinae's current API.

Deleting a command removes its desktop entry. Before uninstalling the extension, delete its commands if you also want to remove these entries. Commands created by this extension use the `vicinae-ai-command-*.desktop` prefix and an ownership marker. On non-Linux platforms the automatic entries are unavailable; an optional native Quicklink action is provided.

## Development

```sh
npm run check
npm run build -- --out dist
node scripts/check-build.mjs dist
npm run smoke
```

`check` validates the manifest and runs TypeScript and deterministic tests. `smoke` lists installed harness models without generating text. `npm run smoke -- claude --generate` (or `codex` / `grok` / `opencode`) sends a dummy translation request and consumes normal account usage.

API tests use a local HTTP server and dummy keys. They exercise authenticated request headers, dynamic catalogs, model/thinking parameters, UTF-8 streaming, provider errors, rate limits, cancellation, and truncated/refused responses. No real API keys or billable direct API calls were available during development. These tests verify the integration protocol; a live provider check is still needed to confirm account access and model-specific acceptance.

When a key becomes available, export the appropriate `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `XAI_API_KEY` in your terminal. Run `npm run smoke:api -- openai-api` (or `anthropic-api` / `xai-api`) to check the catalog. Add `--generate --model MODEL_ID` to explicitly make one billable dummy translation request. Never put keys in tracked files.

Codex generation ignores user agent configuration and uses its normal saved login. Catalog discovery explicitly selects the built-in OpenAI provider. An explicit `model_catalog_json` override is rejected because it supplies a custom catalog rather than current subscription models.

Vicinae bundles entrypoints as CommonJS. The Claude SDK must retain ESM semantics, so npm installation and the local build copy its unchanged `sdk.mjs` and notices into generated assets and load it with a computed dynamic import. The npm `postinstall` also prepares assets when the Store runs `vici build` directly. Do not replace this with a static runtime SDK import: its `createRequire(import.meta.url)` will crash inside a CommonJS bundle.

Native form text fields use `defaultValue`, and saving reads `Form.Values`. This avoids controlled-input focus/value synchronization problems observed with the target Vicinae build.

The extension code is MIT licensed. Dependencies, particularly the Claude Agent SDK, retain their own licenses and terms; the SDK's license and notices accompany the generated asset. No provider CLI binaries are bundled. Store updates are submitted as pull requests to `vicinaehq/extensions`. Keep the source in `extensions/ai-commands` synchronized with this repository.

## Integration references

Provider choices were compared with [T3 Code](https://github.com/pingdotgg/t3code) at commit `4664c572a78231611491f63f677f0e007ebaab03`:

- [Claude text generation](https://github.com/pingdotgg/t3code/blob/4664c572a78231611491f63f677f0e007ebaab03/apps/server/src/textGeneration/ClaudeTextGeneration.ts) uses the installed CLI, disables tools/hooks, and checks completion. This extension uses the official Agent SDK around that CLI for model discovery and streaming.
- [Codex text generation](https://github.com/pingdotgg/t3code/blob/4664c572a78231611491f63f677f0e007ebaab03/apps/server/src/textGeneration/CodexTextGeneration.ts) uses `codex exec --ephemeral` with read-only access. This extension follows that single-request pattern and obtains models through `app-server` `model/list`.
- [Grok provider probing](https://github.com/pingdotgg/t3code/blob/4664c572a78231611491f63f677f0e007ebaab03/apps/server/src/provider/Layers/GrokProvider.ts) reads model metadata from ACP initialization without creating a session. This extension follows that pattern. Generation uses Grok's supported headless CLI stream, which directly accepts a custom system instruction.

Additional integration sources: [OpenCode server API](https://opencode.ai/docs/server/), [T3 OpenCode text generation](https://github.com/pingdotgg/t3code/blob/4664c572a78231611491f63f677f0e007ebaab03/apps/server/src/textGeneration/OpenCodeTextGeneration.ts), [OpenAI Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [Anthropic models and capabilities](https://platform.claude.com/docs/en/api/models/list), [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), and [xAI language models](https://docs.x.ai/developers/rest-api-reference/inference/models).

The [Vicinae API source](https://github.com/vicinaehq/vicinae/tree/main/src/typescript/api/src) was checked alongside the installed API version. Native Quicklink creation opens a confirmation form. Automatic Linux entries use a private desktop-entry directory and native Desktop Actions for editing. Publishing the extension requires documenting this separate local setup step; installing the Store bundle alone cannot configure the Vicinae server's search path.
