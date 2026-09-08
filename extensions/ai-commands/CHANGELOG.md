# Changelog

## 0.3.0

Initial Store submission.

- Create, edit, duplicate, and delete saved text transformations.
- Use `{selection}` and `{clipboard}` in prompts, with a model and thinking level for each command.
- Connect through installed Claude Code, Codex, Grok, or OpenCode CLIs, or supply an OpenAI, Anthropic, or xAI API key.
- Preview wrapped plain text, refine the answer, and press Enter to paste into the source app.
- Keep optional local history and clear it from AI Command History.
- Enable private root-search entries and an Edit AI Command action through Setup AI Commands, without a terminal or source checkout.
- Delete commands even when the Vicinae executable cannot be found.
- Stop CLI process groups when the extension runtime exits or is killed.

Tested on Omarchy, Hyprland, and Wayland. Direct API integrations have local HTTP tests but have not been tested with live API keys. Rich-text editors that move their own selection may require manual pasting.
