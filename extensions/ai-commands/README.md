# AI Commands for Vicinae

Save prompts to translate, rewrite, or transform text with Claude Code, Codex, Grok, OpenCode, or direct OpenAI, Anthropic, and xAI APIs.

Select text in another app, run a command, review the answer, and press **Enter** to replace the selection. Long results wrap and scroll.

## Install

Requires Linux and Vicinae 0.28.1 or later. Tested on Omarchy with Hyprland and Wayland.

The [Vicinae Store submission](https://github.com/vicinaehq/extensions/pull/385) is under review. To install from source, use Node.js 22 or later:

```sh
git clone https://github.com/vdmkotai/vicinae-ai-commands.git
cd vicinae-ai-commands
npm ci
npm run build
```

The build installs the extension locally. After Store approval, you can install **AI Commands** by **vdmkotai** there instead.

## Connect a provider

For **Claude Code, Codex, Grok, or OpenCode**, install the CLI and sign in through it first. Your account must include access to that CLI and model. The extension uses its saved login. Set a custom executable path in extension preferences if needed.

For **OpenAI, Anthropic, or xAI API**, enter the corresponding API key in extension preferences. API usage has separate provider billing. Password fields hide keys but are not an encrypted OS keyring.

Run **Check AI Harnesses** to check connections and load available models. Tested CLI versions: Claude Code 2.1.263, Codex 0.153.4, Grok ACP 1.0.13, and OpenCode 1.18.29.

## Create and run

1. Open **Create AI Command**. Set a name, provider, model, thinking level, prompt, and optional system instruction.
2. Use `{selection}` for highlighted text or `{clipboard}` for copied text. Save with **Ctrl+Enter**.
3. Select text in another app and run your command from **AI Commands**.
4. Press **Enter** to paste the completed answer, or **Ctrl+C** to copy it.

Example prompt:

```text
Translate into English. Keep my tone. Return only the translation.

{selection}
```

Models and available CLI thinking levels load from the provider. API thinking choices depend on what the selected model accepts. Placeholders appear as ordinary text in the editor.

**Ctrl+.** cancels generation. **Ctrl+R** refines a completed answer. Use **AI Commands** to edit, duplicate, or delete saved commands.

## Desktop integration

To give each command its own root-search entry, follow the separate [desktop setup](docs/desktop-integration.md). Store installation does not configure it. The setup currently supports a user-owned Vicinae shell launcher, as used on Omarchy.

Entries live in a private directory outside normal application menus. In root search, open **Actions → Edit AI Command** to edit one. Commands also work from the internal list without desktop setup.

## Data and limitations

- The selected provider receives your prompt and referenced text. Optional local history stores up to 100 runs; disable or clear it through the extension. Grok also keeps its own CLI sessions.
- Cancellation, timeouts, and extension runtime termination stop the owned CLI process group.
- Input and output are plain text. Pasting requires an editable field that retains its selection. Some rich-text editors, including the X composer, can move selection themselves; reselect the intended text and paste manually in that case.
- Direct APIs have local HTTP tests but have not been tested with live API keys. OpenCode connections that require external plugins are unsupported.

See [development and testing](docs/development.md) for build checks, provider behavior, and process cleanup. The extension uses the [MIT license](LICENSE); bundled dependencies retain their own licenses.
