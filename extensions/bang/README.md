<img src="assets/bang.svg" alt="Bang icon" width="80" />

# Bang

Fuzzy-search your shell history in [Vicinae](https://vicinae.com), edit a command,
and run it in your terminal—only when you choose to.

## Features

- Local Bash, Zsh and Fish history, including supported multiline formats.
- Fuzzy search with highlighted matches, deduplication, recency and frequency ranking.
- Review and edit suggestions, type a new command, or copy without running.
- Independently configurable editor review and execution confirmation, both on by default.
- Save executed commands to shell history and keep terminal output open until Enter.

## Requirements

- Linux and Vicinae. Tested with **Vicinae 0.30.0**; other versions are not yet verified.
- Your chosen shell and a terminal emulator, already installed.
- Node.js **22+** and npm to build from source.

Highlighting uses Vicinae's built-in renderer. Bang does not download tools or
require additional Python or Qt packages.

## Installation

Build from the source repository:

```bash
git clone https://github.com/professormahi/vicinae-bang.git
cd vicinae-bang
npm ci
npm run build
```

If working in the community extensions repository instead, run the npm commands
from `extensions/bang`.

The build installs Bang into
`${XDG_DATA_HOME:-$HOME/.local/share}/vicinae/extensions/bang`, replacing an
existing local installation at that path. Search for **Bang** in Vicinae to open it.
If it is not discovered, run `npm run dev` until the first build completes, then
stop it with Ctrl+C. No server restart is normally needed.

To remove Bang, use Vicinae's **Show Installed Extensions** command.

## Usage

1. Open **Bang** and search, for example `docker comp` or `dck cmp`.
   Matching characters are bold and underlined. An empty query shows recent commands.
2. Press **Enter / Review and Edit Command** to open the editor by default.
   Your exact input is also available as **New Command**, even without a history match.
3. Choose **Run in Terminal…** and confirm. Pipes, redirects and multiline syntax
   are interpreted by your selected shell.
4. After execution, press Enter in the terminal to close it. Executed commands
   are saved to your configured history by default, including commands that fail.

Use the action panel for **Copy Command**, **Reload History** and **Open Preferences**.
Searching uses an in-memory snapshot; changes on disk appear after reload or reopening.
Copy/Edit/Refresh use Vicinae's configurable named shortcuts. There is no Tab completion.

**Disabling Command Review makes Run the primary action.** If Execution Confirmation
is also disabled, an explicit Run/Enter launches immediately. Typing, selecting
or hovering never runs anything.

### Optional `!` alias

Choose **Set Up ! Alias…** in the action panel, verify the settings-file path,
and approve **Back Up and Set Alias**. Setup always requires separate consent
and creates a private backup of the whole configuration. Keep that backup private.
Do not edit Vicinae settings concurrently. Existing aliases are not overwritten.
Managed, layered or linked configs need manual alias setup instead; see the
[developer guide](docs/DEVELOPMENT.md#alias-setup).

Then type **`!` followed by Space** in Vicinae to open Bang.
Typing `!docker` directly in root search does **not** activate Bang: live root
prefix routing is not exposed by the verified SDK. A leading `!` inside Bang is
literal shell input.

## Preferences

Choose **Open Preferences** from Bang's action panel. Reopen Bang or use
**Reload History** after changing settings.

| Preference | Default / behavior |
|---|---|
| Command Review | On; opens the editor before running. |
| Execution Confirmation | On; asks before launching, independently of editor review. |
| Save Executed Commands | On; saves full command text after exit. Turn off for private commands. |
| Shell | Auto detects `$SHELL`; supports Bash, Zsh and Fish, falling back to Bash. |
| History Path | Shell default; override with an absolute path or `~/path`. |
| Shell Executable | Selected shell's executable; optional absolute-path override. |
| Maximum History Items | 10,000 unique commands; range 1–50,000. Up to 50 results are displayed. |
| Working Directory | Home directory; accepts an absolute path or `~/path`. |
| Wait for Enter before closing | On; keeps output visible after the command exits. |

Default history paths are `~/.bash_history`, `${ZDOTDIR:-$HOME}/.zsh_history`, and
`${XDG_DATA_HOME:-$HOME/.local/share}/fish/fish_history`. Shell-specific environment
overrides are supported, but GUI applications may not inherit your shell's variables.
Set **History Path** explicitly if needed. Paths do not expand `$VAR` or glob patterns.

Bang uses Vicinae's terminal selection, following the **xdg-terminal-exec specification**.
To select a terminal, put its installed desktop ID in `~/.config/xdg-terminals.list`
(or the appropriate desktop-specific list), for example `org.gnome.Terminal.desktop`.
Bang does not install terminals or change that global configuration.

## Safety and privacy

- **Commands run with your full user privileges, not in a sandbox.** Review
  unfamiliar history before running it. The shell is non-interactive, so
  session-only aliases, functions and environment changes are not recreated.
- History stays local. Bang has no telemetry, cloud service, AI, global keyboard
  hook or persistent daemon. Commands you deliberately run can still access the network.
- Likely credentials are hidden in previews, but detection is heuristic. The
  editor, clipboard, confirmation and executed command contain the original text.
  Sensitive copying requires confirmation; other apps may still read the clipboard.
- **Saving is on by default and includes secrets.** Bang does not apply shell
  `HISTIGNORE`, `HISTCONTROL` or leading-space privacy rules. Disable saving for
  private commands. Other shell sessions can overwrite or replace history.
- Terminal launch arguments contain only runner/socket paths, not command text.
  A private, one-use local socket passes the command to the runner. The selected
  shell receives `-c` and the command directly, without an outer shell wrapper.
  Shell processes and OS auditing can still expose command contents.

## Troubleshooting and limitations

- **Missing recent commands:** flush history in your shell (`history -a` in Bash,
  `fc -AI` in Zsh, `history save` in Fish), then reload. Unsaved session history
  is unavailable. Reads are limited to the newest **4 MiB**.
- **Multiline Bash history:** timestamped entries preserve boundaries; plain
  history cannot recover arbitrary multiline commands. See the
  [history notes](docs/DEVELOPMENT.md#history-behavior).
- **No terminal window:** check Vicinae's default terminal and the shell executable.
  “Terminal launch requested” is not a guarantee that a window opened; there is
  no background retry. Keep Bang open until the terminal starts.
- **Missing new preferences after updating:** select another extension in Vicinae
  Settings, then reselect Bang. See the [developer guide](docs/DEVELOPMENT.md#development)
  if the installed manifest still needs refreshing.

For development, testing, compatibility details and community submission, see
[the developer guide](docs/DEVELOPMENT.md).

## License

[MIT](LICENSE).
