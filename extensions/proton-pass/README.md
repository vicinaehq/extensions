# Proton Pass for Vicinae

A Linux-native Vicinae extension for Proton Pass, using the existing `pass-cli` installation.

This port is an independent Vicinae implementation informed by the MIT-licensed Proton Pass Raycast extension by izyuumi and FeernandoOFF. It ports the Raycast integration's useful CLI-backed workflows without depending on Raycast or a browser extension.

## Features

- Search all items across all Proton Pass vaults, with an inline vault filter. Search matches titles, usernames, emails, vault names, types and URLs.
- Browse vaults and their items.
- Colour-coded vaults: vaults are coloured by **role** by default (owner=yellow, manager=blue, editor=green, viewer=secondary, with role icons), matching the Raycast extension. Override individual vaults with the **Vault colours** preference, e.g. `Personal=green, Work=#1E90FF`. (Proton's own per-vault colours are not exposed by `pass-cli`.)
- Open an on-demand item details view with masked secrets, URLs, notes and custom fields, plus type-specific fields (card number, expiry, security code for cards; identity, Wi-Fi and SSH-key fields), with secrets masked.
- Copy usernames, emails, passwords and TOTP codes on demand.
- Select any listed item in the TOTP command; the extension then asks `pass-cli` for that item's code, rather than requiring the user to know share or item IDs.
- Generate configurable random passwords: 8–128 characters, numbers, uppercase letters and symbols.
- Generate configurable passphrases: 3–10 words, capitalisation, numbers and separators.
- Score generated passwords with the real `pass-cli password score` (Strong/Good/Weak/Vulnerable) and list the specific weaknesses it finds, with a colour-coded strength indicator.
- Keyboard shortcuts for the common actions: copy password (Ctrl+Shift+C), copy username (Ctrl+Shift+U), copy TOTP (Ctrl+Shift+T), open in browser (Ctrl+Shift+O).
- Choose your primary and secondary actions for Search items, so Enter does what you want (view, copy or open).
- Optionally close the launcher with a brief HUD after copying a value.
- Display live TOTP codes with a 30-second countdown and automatic refresh.
- Cache vault and item metadata for fast startup while never caching passwords or TOTP values.
- Optionally clear copied passwords and TOTP codes after a safe, configurable timeout.
- Check or start the local Proton Pass CLI login session; browser login URLs are opened automatically when pass-cli emits one.
- Use the official Proton Pass diamond icon for the extension and every command.
- Configure the `pass-cli` path and default password generator settings.

## Requirements

- Linux.
- Proton Pass CLI (`pass-cli`) installed and authenticated.
- The CLI session must have permission to read the requested item. The extension supplies a descriptive `PROTON_PASS_AGENT_REASON` for protected reads.

## Install from a local checkout

```bash
cd extensions/proton-pass
npm install
npm run build
```

The build is installed by Vicinae under:

```text
~/.local/share/vicinae/extensions/proton-pass
```

Set the extension's `pass-cli path` preference to the absolute path when Vicinae does not inherit the shell `PATH`, for example:

```text
/home/cristian/.local/bin/pass-cli
```

## Commands

- **Search Proton Pass Items** — searches every vault, filters by vault, opens item details and exposes copy/open actions with keyboard shortcuts. The primary and secondary actions are configurable in preferences.
- **List Proton Pass Vaults** — opens a vault, then searches its items, sharing the same detail view and actions as Search.
- **Get Proton Pass TOTP Code** — lists every item; select one and choose **Copy TOTP Code**.
- **Generate Proton Pass Password** — visible controls for length, character classes, word count and separators, with a real `pass-cli` strength score and weakness list. Enter generates a new password.
- **Login to Proton Pass** — checks the CLI session and starts browser login when required.

Run the deterministic CLI contract tests with:

```bash
npm test
```

The extension deliberately does not cache passwords or TOTP values. Item listing normally uses one authenticated `--show-secrets` request per vault for fast startup, then retains only non-secret metadata; if the CLI rejects that flag (for example in an agent session), it falls back to field-level metadata requests. Full item content is fetched only when an item is selected. Passwords and TOTP values are copied with concealed clipboard handling, and URLs are sanitised before they enter metadata cache.

The square icon is derived from Proton's official Proton Pass logo mark; `extension_icon.svg` is kept alongside the raster asset as the source artwork.
