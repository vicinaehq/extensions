# Codex for Vicinae

Vicinae extension for ChatGPT Codex via local `codex` CLI.

Extension gives UI for:

- chatting with Codex from Vicinae
- attaching files or directories
- choosing skills
- choosing model
- choosing thinking level
- browsing and managing saved sessions

No direct OpenAI API wiring in extension. Extension shells out to local `codex` command.

## Requirements

- [Vicinae](https://github.com/vicinaehq/vicinae)
- [bun](https://www.bun.sh/)
- OpenAI Codex CLI installed
- Codex CLI logged in with OpenAI account

Install Codex CLI:

```bash
bun i -g @openai/codex
```

Login:

```bash
codex
```

Then complete sign-in flow with OpenAI account.

Recommended:

- install Caveman skills from [getcaveman.dev](https://getcaveman.dev)
- extension defaults to `caveman` when skill installed

## What It Does

### `Chat`

Main command.

Features:

- textarea prompt input
- optional session title for new chats
- optional work directory for new chats
- file and directory attachments
- skill selector
- follow-up prompts in existing sessions

Behavior:

- default work directory: `~/code/codex/`
- work directory auto-created if missing
- follow-up prompts reuse saved session work directory
- follow-up form hides session-title and work-directory fields
- `caveman` auto-selected by default if installed
- `/compact` auto-injected into every prompt

### `Sessions`

Browse stored sessions.

Actions:

- open session
- send follow-up
- rename
- archive / unarchive
- permanently delete

### `Models`

Choose default Codex model from local Codex model cache.

### `Thinking`

Choose reasoning effort:

- `low`
- `medium`
- `high`
- `xhigh`

## Attachments

Extension supports:

- files
- directories
- images

Behavior:

- images pass to Codex as image inputs
- non-image files stay available by local path
- directories are added as readable local paths
- attachment limits enforced before run

## Skills

Skills come from local skill roots:

- `~/.codex/skills`
- `~/.agents/skills`

Behavior:

- skills shown in dropdown
- selected skills shown below field
- selecting checked skill toggles it off
- if no skill chosen, default installed skills still apply
- `caveman` preferred by default when installed

Recommended skill pack:

- Caveman skills: https://getcaveman.dev

## Sessions Storage

Extension stores own session metadata locally.

Includes:

- title
- timestamps
- model
- work directory
- Codex session id
- messages
- attachment summaries

When deleting session permanently, extension also attempts cleanup of matching ambient Codex session artifacts.

## How Prompts Run

Extension runs local `codex exec` in background.

New session:

- starts fresh `codex exec`

Follow-up:

- uses `codex exec resume`

Prompt payload includes:

- prompt prefix from preferences
- selected skills
- `/compact`
- attachment context

## Preferences

Extension preferences:

- `Model`
- `Prompt Prefix`

## Development

Install deps:

```bash
bun i
```

Run dev:

```bash
bun dev
```

Build:

```bash
bun run build
```

Format:

```bash
bun run format
```

Lint:

```bash
bun run lint
```

## Project Layout

```text
src/codex.tsx                Main Chat command
src/sessions.tsx             Sessions command
src/models.tsx               Models command
src/thinking.tsx             Thinking command
src/lib/codex-ui.tsx         Vicinae UI screens
src/lib/codex-service.ts     Codex process + session logic
```

## Notes

- Extension depends on working local `codex` CLI.
- If CLI missing, extension shows install/login guidance.
- Default model in manifest currently `gpt-5.4`.
