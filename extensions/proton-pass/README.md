# Proton Pass for Vicinae

A Linux-native Vicinae extension for Proton Pass, using the existing `pass-cli` installation.

This port is an independent Vicinae implementation informed by the MIT-licensed Proton Pass Raycast extension by izyuumi and FeernandoOFF.

## Features

- Browse and search items across Proton Pass vaults.
- Copy usernames, passwords and TOTP codes on demand.
- Generate random passwords or passphrases with `pass-cli`.
- Use a configurable `pass-cli` path, defaulting to `pass-cli` in `PATH`.

## Requirements

- Linux.
- Proton Pass CLI (`pass-cli`) installed and authenticated.
- The CLI session must have permission to read the requested item. The extension supplies a descriptive `PROTON_PASS_AGENT_REASON` for protected reads.

The extension deliberately does not download a CLI binary, cache secrets, or implement browser integration. Passwords and TOTP values are fetched only when the user invokes the corresponding action and are copied with concealed clipboard handling.
