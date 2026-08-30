# Custom Commands

Create and run your own custom shell commands directly from Vicinae.

Define any shell command once — with dynamic placeholders, custom icons, and grouping — and run it instantly via search. Background tasks copy output to clipboard, terminal tasks open in your preferred terminal.

## Features

- **Manage Commands** — create, edit, duplicate, delete
- **Terminal vs Background** — run silently (output copied to clipboard) or in a terminal window (`runInTerminal` with `hold` + `workingDirectory`)
- **Grouping** — assign a `group` (e.g. `git`, `docker`, `system`); filter via dropdown, sections per group (`Ungrouped` last), search includes group
- **Dynamic Placeholders** — `{{name}}` prompts for input, system placeholders auto-filled:
  - User: `{{host}}`, `{{branch}}`, `{{msg}}`, `{{file}}`, `{{path}}`, `{{url}}`, `{{args}}`, etc. (any `{{key}}`)
  - System (single-quoted for safety): `{{clipboard}}`, `{{selection}}` (fallback to clipboard), `{{home}}`, `{{user}}`, `{{date}}`, `{{time}}`, `{{datetime}}`
  - Case-insensitive: `{{Clipboard}}` ≡ `{{clipboard}}`
- **Custom Icons** — URL or local file path (`https://…/icon.png`, `/home/user/.icons/foo.svg`, `~/icons/icon.png`); empty → `Icon.Terminal` fallback via `getIcon()`
- **Working Directory** — per-command `workdir` with global `defaultWorkdir` preference fallback
- **Import / Export** — export all commands as JSON to clipboard, import from clipboard
- **Search** — filter by name, command, description, or group

## Command

| Command | Title | Description |
|---------|-------|-------------|
| `commands` | Custom Commands | Create and run your custom shell commands |

Open via Vicinae root search → `Custom Commands`.

## Placeholders

Use `{{key}}` anywhere in the command string. At run time:

- User keys → `RunWithArgsForm` generates one text field per unique non-system key.
- System keys → auto-resolved (clipboard via `Clipboard.readText()`, home via `os.homedir()`, etc.) and **shell-escaped** (`'${val.replace(/'/g,"'\\''")}'`) before `bash -c`.

Examples:

| Name | Command |
|------|---------|
| Open project | `code {{path}}` |
| Commit | `git commit -m "{{msg}}" && git push origin {{branch}}` |
| Copy via clipboard | `echo {{clipboard}} \| jq` |
| Backup | `mkdir -p {{home}}/backup-{{date}}` |
| SCP | `scp {{file}} {{host}}:/tmp` |

System placeholders do not prompt; user placeholders do. All placeholders are case-insensitive.

## Preferences

| Preference | Type | Description |
|------------|------|-------------|
| Terminal | Text field | Terminal command (e.g. `kitty`, `gnome-terminal --`). Leave empty to use Vicinae default (`xdg-terminal-exec`). |
| Default Working Directory | Text field | Fallback `cwd` for commands without a custom working directory. |

Execution always closes the Vicinae window on success (via `closeMainWindow()`).

## Storage

Commands stored in `LocalStorage` key `custom-commands:commands` as JSON array of `CustomCommand { id, name, command, description, workdir, terminal, icon, group, createdAt }`.

## Installation

```bash
cd extensions/custom-commands
npm install
npm run build   # vici build
# or
npm run dev     # vici develop
```

## Requirements

- Linux (declared `platforms: ["Linux"]` but uses portable `runInTerminal` API)
- Node.js 18+

## Supported Platforms

- Linux

## License

MIT
