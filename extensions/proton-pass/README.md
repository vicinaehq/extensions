# Proton Pass for Vicinae

A Linux-native Vicinae extension for Proton Pass, using the existing `pass-cli` installation.

This port is an independent Vicinae implementation informed by the MIT-licensed Proton Pass Raycast extension by izyuumi and FeernandoOFF. It ports the Raycast integration's useful CLI-backed workflows without depending on Raycast or a browser extension.

## Features

- Search all items across all Proton Pass vaults, with an inline vault filter. Search matches titles, usernames, emails, vault names, types and URLs.
- Browse vaults and their items; each vault shows its role and live item count.
- Colour-coded vaults: vaults are coloured by **role** by default (owner=yellow, manager=blue, editor=green, viewer=secondary, with role icons), matching the Raycast extension. Override individual vaults with the **Vault colours** preference, e.g. `Personal=green, Work=#1E90FF`. (Proton's own per-vault colours are not exposed by `pass-cli`.)
- Open an on-demand item details view with masked secrets, URLs, notes and custom fields, plus type-specific fields (card number, expiry, security code, PIN for cards; identity, Wi-Fi and SSH-key fields), with secrets masked. Useful typed fields (card number, expiry, PIN, Wi-Fi password, SSH keys, identity email/phone) each get their own **Copy** action.
- Copy or paste usernames, emails, passwords and TOTP codes on demand. Password paste is the default Enter action for login items with a detected password; other item types or passwordless logins fall back to their next available action.
- Select any listed item in the TOTP command; the extension then asks `pass-cli` for that item's code, rather than requiring the user to know share or item IDs.
- Generate configurable random passwords: 8–128 characters, numbers, uppercase letters and symbols.
- Generate configurable passphrases: 3–10 words, capitalisation, numbers and separators; the last-used generator settings are remembered locally for the next session.
- Score generated passwords with the real `pass-cli password score` (Strong/Good/Weak/Vulnerable) and list the specific weaknesses it finds, with a colour-coded strength indicator.
- Keyboard shortcuts for common actions: copy password (Ctrl+Shift+C), copy username (Ctrl+Shift+U), paste TOTP (Ctrl+Shift+T), copy TOTP (Ctrl+Shift+Y), view details (Ctrl+Shift+D), view vault items (Ctrl+Shift+V), refresh (Ctrl+Shift+R), copy-and-generate-next (Ctrl+Shift+G), and open in browser (Ctrl+Shift+O). In List action panels, Vicinae reserves Enter and Shift+Enter for the first two actions; those promoted actions use the built-in bindings.
- Choose your primary and secondary actions for Search items, so Enter does what you want (view, paste, copy or open).
- Close the launcher with a brief HUD after copying a value (on by default, so you return to your previous window; can be turned off in preferences).
- Display live TOTP codes with a circular progress ring, a 30-second countdown and automatic refresh. The ring and code share one explicit palette: Proton purple while healthy, orange after 10 seconds, and red in the final 5 seconds.
- Cache vault and item metadata for fast startup while never caching passwords or TOTP values.
- Optionally clear copied passwords and TOTP codes after a safe, configurable timeout.
- Check or start the local Proton Pass CLI login session; browser login URLs are opened automatically when pass-cli emits one.
- Use the official Proton Pass diamond icon for the extension and every command.
- Configure the `pass-cli` path; generator settings are adjusted in the command and remembered locally.

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

- **Search Proton Pass Items** — searches every vault, filters by vault, opens item details and exposes copy/paste/open actions with keyboard shortcuts. Login rows always reserve **Paste Password** on Enter and **Paste Username/Email** on Shift+Enter; configurable action preferences apply to non-login rows.
- **List Proton Pass Vaults** — opens a vault, then renders the same item rows, live TOTP ring, detail pane, credential actions and shortcuts as Search Proton Pass Items.
- **Get Proton Pass TOTP Code** — lists Proton Pass items that advertise TOTP; select one and choose **Paste TOTP Code** or **Copy TOTP Code**.
- **Generate Proton Pass Password** — a generated password item with a real `pass-cli` strength score and weakness list. Settings are actions (increase/decrease length or words with Ctrl+= / Ctrl+-, toggle character classes, cycle the separator, switch type), the type is a search-bar dropdown, and Enter pastes the password. **Copy Password** is available separately with Ctrl+Shift+C. **Paste and Generate Next** is available as the next action (Shift+Enter); **Copy and Generate Next** uses Ctrl+Shift+G; Ctrl+R generates a new password.
- **Login to Proton Pass** — checks the CLI session and starts browser login when required.

Run the deterministic CLI contract tests with:

```bash
npm test
```

The extension deliberately does not cache passwords or TOTP values. Item listing normally uses one authenticated `--show-secrets` request per vault for fast startup, then retains only non-secret metadata; if the CLI rejects that flag (for example in an agent session), it falls back to field-level metadata requests. Full item content is fetched only when an item is selected. Passwords and TOTP values are copied with concealed clipboard handling, and URLs are sanitised before they enter metadata cache.

The square icon is derived from Proton's official Proton Pass logo mark; `extension_icon.svg` is kept alongside the raster asset as the source artwork.
