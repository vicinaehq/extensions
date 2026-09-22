# OpenCode

Use [OpenCode](https://opencode.ai/v2) from the launcher: browse and resume sessions,
start new work, ask questions, review changes, and open the TUI in a
terminal.

This extension does not replace the OpenCode TUI. It covers finding things and
quick actions. OpenCode runs the agent, its tools, its permissions, and the
conversation itself.

## Requirements

- [Vicinae](https://vicinae.com) with extension support.
- **OpenCode V2 must be installed separately.** This extension does not provide or bundle OpenCode.
  Get the V2 CLI from [opencode.ai/v2](https://opencode.ai/v2/docs) (`curl -fsSL https://opencode.ai/v2/install | bash`).
- A configured OpenCode provider (models run inside OpenCode, not in this extension).

## Installation

From the extension store: use the store command in Vicinae and search for "OpenCode".

Manually:

```bash
git clone https://github.com/vicinaehq/extensions
cd extensions/opencode
npm install
npm run build
```

## OpenCode setup

The extension talks to an OpenCode V2 server using the official `@opencode/client`:

1. If OpenCode is running (TUI or background service), it is discovered automatically through the
   official service registration. No configuration is needed.
2. If no server is running, the extension offers a **Start OpenCode** action that starts the
   background service through the official client mechanism.
3. Remote or explicitly configured servers can be set in the extension preferences.

## Commands

| Command | What it does |
| --- | --- |
| **Sessions** | Browse, search, resume, and manage sessions. Each row shows its status (Working, Waiting for Input, Idle, Failed). Search also covers sessions you have not loaded yet, and results load in pages. Actions: Resume in Terminal, Send Prompt, Rename, Delete, Copy Session ID. |
| **Projects** | Browse the projects OpenCode knows, with version control info, session counts, and working badges. Actions: New Session, View Sessions, Open Directory, Open Shell. |
| **Ask** | Ask anything with streaming answers and follow-ups, optionally scoped to a project. Model dropdown, full conversation view. Open the session in the terminal to keep working there. |
| **Review** | Read working tree, staged, or branch diffs per file with syntax highlighting, then ask OpenCode to review or explain them. |
| **New Session** | Start a new session: pick a project, optional prompt, model shown in the form. |

## Configuration

| Preference | Default | Description |
| --- | --- | --- |
| Server URL | *(auto-discover)* | Explicit OpenCode server endpoint, e.g. `http://127.0.0.1:49374`. Leave empty for local discovery. |
| Server Username | `opencode` | HTTP basic auth username for a configured server. |
| Server Password | *(empty)* | HTTP basic auth password for a configured server. |
| OpenCode Executable | *(auto-detect)* | OpenCode V2 executable used to open sessions. Auto-detects `opencode2` or `opencode` on PATH and verifies it is a V2 build. |

## Development commands

```bash
npm install        # install dependencies
npm run typecheck  # tsc --noEmit
npm run test       # bun test
npm run lint       # vici lint
npm run build      # vici build
npm run dev        # vici develop
```

Tests run with [bun](https://bun.sh). Install it first (`npm test` invokes `bun test`). The tests
cover the helper functions directly and run the OpenCode client against a fake server. Two
test files (`test/config.test.ts`, `test/conversation-detail.test.ts`) stand in for the
Vicinae runtime through `test/setup.ts`.
