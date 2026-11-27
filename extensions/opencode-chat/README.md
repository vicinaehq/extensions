# OpenCode Chat

Chat with AI models through your local [OpenCode](https://opencode.ai) installation directly from Vicinae.

## Prerequisites

- [OpenCode](https://opencode.ai) installed and configured with at least one provider

## Features

- Persistent conversation history with search
- Switch models mid-conversation
- Copy any conversation as Markdown
- Works as a Vicinae fallback command

## Preferences

| Preference | Description | Default |
|---|---|---|
| Default Model | Model in `provider/model` format (e.g. `anthropic/claude-sonnet-4-20250514`) | `anthropic/claude-sonnet-4-20250514` |
| System Prompt | Default system prompt for new conversations. Leave empty for none. | A concise technical assistant prompt |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Ctrl+M` | Switch model |
| `Ctrl+C` | Copy conversation as Markdown |
| `Ctrl+D` | Delete conversation |
| `Ctrl+Shift+D` | Clear all history |
