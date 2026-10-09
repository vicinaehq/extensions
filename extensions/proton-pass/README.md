# Proton Pass for Vicinae

Search, copy and manage credentials from your [Proton Pass](https://proton.me/pass) vaults inside Vicinae. This extension talks to the [Proton Pass CLI](https://github.com/protonpass/pass-cli) (`pass-cli`).

> [!WARNING]
> The code of this project is mainly LLM Generated, with basic manual audit, use it with caution.

## Requirements

- [Proton Pass CLI](https://protonpass.github.io/pass-cli/) installed and available on `PATH` (or set a custom path in the extension preferences)
- A Proton Pass account, authenticated with `pass-cli login`

## Preferences

- **pass-cli path** — Path to the `pass-cli` executable. Leave empty to use `pass-cli` from `PATH`.
- **Key provider** — Sets `PROTON_PASS_KEY_PROVIDER` for every `pass-cli` invocation (`keyring`, `fs` or `env`). Defaults to `Auto`, which inherits the environment and lets pass-cli decide.
- **Linux keyring backend** — Sets `PROTON_PASS_LINUX_KEYRING` (`kernel` or `dbus`, e.g. GNOME Keyring / KWallet Secret Service). Linux only; ignored elsewhere. Defaults to `Auto`.
- **Cache vault/item metadata** — Caches item titles, vault names and IDs in Vicinae's local storage so lists render instantly, then refresh in the background. Passwords, notes, usernames and TOTP codes are never cached. Disable for a zero-disk-footprint mode; use the **Clear Cache** action (in Search Items / List Vaults) to wipe it manually.

These overrides make the keyring behaviour independent of how the Vicinae process was launched: if Vicinae is started from a desktop environment rather than your shell, shell-exported variables are not inherited.

## Commands

- **Proton Pass Search Items** — Search items across all vaults. Filter by vault, view details, copy passwords/usernames/TOTP codes, and paste passwords into the frontmost app.
- **Proton Pass List Vaults** — Browse vaults and drill into each vault's items.
- **Proton Pass Get TOTP Codes** — Live TOTP codes for every item that has 2FA configured, refreshing every 30 seconds.
- **Proton Pass Generate Password** — Generate random passwords or passphrases with configurable length, character classes and separators.
- **Proton Pass Login** — Check your authentication status and start the browser-based login flow.

## Development

```bash
npm install
npm run dev
```

Build the production bundle:

```bash
npm run build
```
