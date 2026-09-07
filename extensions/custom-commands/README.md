# Custom Commands

Create and run your own shell commands right from Vicinae.

Set up a command once with placeholders, icons, and groups, then find and run it instantly through search. Run quietly in the background and get output copied to clipboard, or open it in your terminal.

## Features

- **Manage commands**: create, edit, duplicate, and delete
- **Run how you want**: background (output goes to clipboard) or terminal window that stays open
- **Groups**: put commands in groups like git, docker, or system, filter with a dropdown, and search by group name
- **Placeholders that ask for input**: write `{{host}}`, `{{branch}}`, `{{msg}}`, or any `{{name}}` and get a field for each one when you run
- **System placeholders that fill themselves**: `{{clipboard}}`, `{{home}}`, `{{user}}`, `{{date}}`, `{{time}}`, `{{datetime}}` are filled automatically and handled safely
- **Case insensitive**: `{{clipboard}}` and `{{Clipboard}}` work the same
- **Custom icons**: paste a URL or a file path like `https://example.com/icon.png` or `~/icons/foo.svg`. Leave it empty and you get the default terminal icon
- **Working directory**: set a folder per command, with a global default if you do not set one
- **Import and export**: copy all commands to clipboard as JSON and import them back
- **Fast search**: filter by name, command, description, or group

## Command

| Command | Title | Description |
|---------|-------|-------------|
| `commands` | Custom Commands | Create and run your custom shell commands |

Find it in Vicinae by searching for Custom Commands.

## How placeholders work

Add `{{key}}` anywhere in your command.

- If it is a system placeholder, it fills in on its own
- If it is a custom name, you will see a field for it when you run the command

All placeholder names are case insensitive.

Examples:

| Name | Command | What happens |
|------|---------|--------------|
| Open project | `code {{path}}` | Asks for a path |
| Commit | `git commit -m "{{msg}}" && git push origin {{branch}}` | Asks for message and branch |
| Use clipboard | `echo {{clipboard}} | jq` | Fills from clipboard safely |
| Backup | `mkdir -p {{home}}/backup-{{date}}` | Uses your home and today's date |
| Copy to server | `scp {{file}} {{host}}:/tmp` | Asks for file and host |

Values are passed safely to the shell, so special characters in clipboard or input do not break your command.

## Preferences

| Preference | Type | Description |
|------------|------|-------------|
| Terminal | Text field | Terminal to use, for example `kitty` or `gnome-terminal --`. Leave empty to use the system default |
| Default Working Directory | Text field | Folder to use when a command does not have its own working directory |

The window closes after a successful run so you can keep going.

## Where commands are saved

Commands are saved locally in Vicinae storage under the key `custom-commands:commands`.

## Installation

```bash
cd extensions/custom-commands
npm install
npm run build   # build once
# or
npm run dev     # watch while you develop
```

## Requirements

- Vicinae installed
- Node.js 18 or newer
- A shell available on your system (bash on Linux and macOS, PowerShell on Windows)

## Supported platforms

- Linux
- macOS
- Windows

## License

MIT
