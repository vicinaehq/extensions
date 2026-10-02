# Proton Pass for Vicinae

A Linux-native Vicinae extension for Proton Pass, using the existing `pass-cli` installation.

This port is an independent Vicinae implementation informed by the MIT-licensed Proton Pass Raycast extension by izyuumi and FeernandoOFF. It ports the Raycast integration's useful CLI-backed workflows without depending on Raycast or a browser extension.

## Features

- Search all items across all Proton Pass vaults.
- Browse vaults and their items.
- Copy usernames, emails, passwords and TOTP codes on demand.
- Select any listed item in the TOTP command; the extension then asks `pass-cli` for that item's code, rather than requiring the user to know share or item IDs.
- Generate configurable random passwords: 8–128 characters, numbers, uppercase letters and symbols.
- Generate configurable passphrases: 3–10 words, capitalisation, numbers and separators.
- Check or start the local Proton Pass CLI login session.
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

- **Search Proton Pass Items** — searches every vault and exposes copy actions.
- **List Proton Pass Vaults** — opens a vault, then searches its items.
- **Browse Proton Pass Vault** — compact all-item browser.
- **Proton Pass TOTP Codes** — lists every item; select one and choose **Copy TOTP Code**.
- **Generate Proton Pass Password** — use the action panel to change length, character classes, word count and separators.
- **Login to Proton Pass** — checks the CLI session and starts `pass-cli login` when required.

The extension deliberately does not cache passwords or TOTP values. Item listing requests `--show-secrets` only so Proton Pass can return username, email and TOTP metadata; the extension retains only non-secret item metadata. Passwords and TOTP values are fetched on demand and copied with concealed clipboard handling.
