# Ente Auth for Vicinae

A cross-platform Vicinae port of the official Ente Auth Raycast extension. It uses the authenticated [Ente CLI](https://github.com/ente-io/ente/tree/main/cli) and the standard `ente_auth.txt` export format; it does not depend on Raycast.

The port is independently implemented from the MIT-licensed Raycast extension by `chkpwd` and retains the useful workflows while adapting them to Vicinae on Linux, macOS, and Windows.

## Features

- Search Ente Auth accounts by service, username, tag, or notes.
- Display current and next TOTP codes with a live one-second countdown.
- Keep list rows compact: the code and seconds stay in the detail pane while a live colour-tinted progress glyph shows the remaining window.
- Paste or copy the current code directly into the focused application, matching Raycast's primary action.
- Copy or paste the next code from the action panel.
- Show a live side-panel detail view with current/next codes, countdown, metadata, notes, and tags.
- Show algorithm, digits, period, tags, username, and notes in a detail view.
- Fetch service icons from Ente's custom icon registry, then Simple Icons, with a notes-URL favicon fallback.
- Refresh service icons manually.
- Export/import secrets through the Ente CLI.
- Delete the local plaintext export after confirmation.
- Never persist TOTP seeds in Vicinae LocalStorage or the extension cache. Seeds are read into memory from the Ente export only while the command is running.

## Requirements

- Linux, macOS 14.4+ on Apple Silicon with Vicinae 0.23.0+, or Windows with Vicinae 0.29.0+.
- Ente CLI 0.3.x (legacy) or 0.4.x and newer, authenticated for the `auth` app.
- A private export directory writable by the current user (default `~/Documents/ente`).

Install and authenticate the CLI first (pick the commands for your version):

```bash
# Ente CLI 0.4.x and newer
ente --version
ente account login --app auth

# Ente CLI 0.3.x
ente version
ente account add  # choose auth, then log in
```

**Version handling is automatic.** With CLI 0.3.x the extension updates the Auth account's `ExportDir` when needed, then runs `ente export`. With CLI 0.4.x and newer it runs `ente auth export --plaintext` to a private temporary file and safely replaces the local `ente_auth.txt` after validating it. Existing exports remain available if a modern export fails. You do not need to switch Ente CLI versions to use the extension.

## Install from a checkout

```bash
cd extensions/ente-auth
npm ci
npm test
npm run build
```

On Linux, Vicinae installs the build under:

```text
~/.local/share/vicinae/extensions/ente-auth
```

If Vicinae cannot find `ente`, set **Ente CLI path** to its absolute path. This is especially useful on macOS because GUI apps may not inherit the Terminal `PATH` (for example, use `/opt/homebrew/bin/ente` or `$HOME/.local/opt/ente-cli/bin/ente`, with the home directory expanded). Set **Ente CLI export directory** if you do not want the default `~/Documents/ente`, or if macOS requests Documents-folder access. The extension never stores seeds in Vicinae LocalStorage. On Windows, protect the export directory with your user account's filesystem permissions.

Keyboard shortcuts use **Ctrl+Shift** on Linux and Windows, and **Cmd+Shift** on macOS. The native paste action relies on Vicinae's clipboard and focus-handling support; verify it on your desktop environment before relying on it for sign-in.

## Commands

- **Get Ente Auth TOTP** — reads the existing export, searches accounts, and copies or pastes codes.
- **Import Ente Auth Secrets** — exports with the selected CLI version, validates the resulting file, and makes it available to the search command.
- **Export Ente Auth Secrets** — exports with the selected CLI version and reports the resulting file.
- **Delete Ente Auth Export** — permanently removes the local `ente_auth.txt` after confirmation.

The **Primary action** preference matches Raycast: it can put **Paste current code** or **Copy current code** on Enter. Vicinae closes its launcher before invoking `Clipboard.paste`, allowing focus to return to the previously active application without requiring a `ydotool` dependency.

Keyboard shortcuts (Ctrl on Linux/Windows, Cmd on macOS):

- Enter — Paste current code (default primary action)
- Primary+Shift+C — Copy current code
- Primary+Shift+N — Copy next code
- Primary+Shift+P — Paste next code
- Primary+Shift+D — View details
- Primary+Shift+O — Open the notes URL
- Primary+Shift+E — Refresh the export
- Primary+Shift+R — Refresh service icons
- Primary+Shift+L — Reload the export after an error
- Primary+Shift+Y — Retry a failed export deletion
- Primary+Shift+G — Open the Ente CLI guide

## Privacy

Ente's export is a plaintext file containing the TOTP seeds. The extension does not duplicate those seeds into Vicinae's persistent storage. Use **Delete Ente Auth Export** when the export is no longer needed, or configure Ente's export directory with appropriate filesystem permissions.

Service icon downloads are cached under Vicinae's support directory. They contain only service names and no authentication data.

## Attribution

The Raycast reference implementation is [raycast/extensions/extensions/ente-auth](https://github.com/raycast/extensions/tree/main/extensions/ente-auth), licensed under MIT. Ente Auth and the Ente marks are the property of Ente.
