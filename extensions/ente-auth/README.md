# Ente Auth for Vicinae

A Linux-native Vicinae port of the official Ente Auth Raycast extension. It uses the authenticated [Ente CLI](https://github.com/ente-io/ente/tree/main/cli) and the standard `ente_auth.txt` export format; it does not depend on Raycast.

The port is independently implemented from the MIT-licensed Raycast extension by `chkpwd` and retains the useful workflows while adapting them to Vicinae and Linux.

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

- Linux.
- The Ente CLI installed and authenticated for the `auth` app.
- An Ente CLI account configured with an export directory.

Install and authenticate the CLI first:

```bash
ente account add
# choose: auth
ente account list
```

The extension uses the `ExportDir` shown by `ente account list`. If the configured Vicinae preference differs, the extension updates the Ente Auth account's export directory before running `ente export`.

## Install from a checkout

```bash
cd extensions/ente-auth
npm ci
npm test
npm run build
```

Vicinae installs the build under:

```text
~/.local/share/vicinae/extensions/ente-auth
```

If Vicinae cannot find `ente`, set **Ente CLI path** to its absolute path. Set **Ente CLI export directory** only when you do not want the default `~/Documents/ente`.

## Commands

- **Get Ente Auth TOTP** — reads the existing export, searches accounts, and copies codes.
- **Import Ente Auth Secrets** — runs `ente export`, validates the resulting file, and makes it available to the search command.
- **Export Ente Auth Secrets** — runs `ente export` and reports the resulting file.
- **Delete Ente Auth Export** — permanently removes the local `ente_auth.txt` after confirmation.

The **Primary action** preference matches Raycast: it can put **Paste current code** or **Copy current code** on Enter. Vicinae closes its launcher before invoking `Clipboard.paste`, allowing focus to return to the previously active application without requiring a `ydotool` dependency.

## Privacy

Ente's export is a plaintext file containing the TOTP seeds. The extension does not duplicate those seeds into Vicinae's persistent storage. Use **Delete Ente Auth Export** when the export is no longer needed, or configure Ente's export directory with appropriate filesystem permissions.

Service icon downloads are cached under Vicinae's support directory. They contain only service names and no authentication data.

## Attribution

The Raycast reference implementation is [raycast/extensions/extensions/ente-auth](https://github.com/raycast/extensions/tree/main/extensions/ente-auth), licensed under MIT. Ente Auth and the Ente marks are the property of Ente.
