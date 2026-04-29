# Vicinae Bitwarden

A native [Vicinae](https://vicinae.com) extension for [Bitwarden](https://bitwarden.com), backed by [`rbw`](https://github.com/doy/rbw) — the unofficial Rust Bitwarden CLI. `rbw-agent` keeps the unlocked vault in RAM, so commands respond in 50–200 ms instead of the ~4 s cold-start that the official `bw` CLI imposes. Works with the official Bitwarden cloud and self-hosted Bitwarden / Vaultwarden servers.

## Requirements

- Vicinae 0.16+
- `rbw` 1.15+ on `$PATH` (or set the `cliPath` preference)
  - Arch / CachyOS: `pacman -S rbw`
  - Fedora: `dnf install rbw`
  - Cargo: `cargo install rbw`
- A pinentry binary (`pinentry`, `pinentry-gtk2`, `pinentry-curses`, etc.) installed system-wide for any rbw use outside Vicinae. Inside Vicinae the extension swaps in its own pinentry shim during login/unlock and restores yours afterwards.
- Bun 1.x (for development)

## Setup

```sh
rbw config set email you@example.com
rbw config set base_url https://vault.example.com   # only for self-hosted
```

1. Generate a personal API key at <https://vault.bitwarden.com/#/settings/security/security-keys> (Settings → Security → Keys → "View API Key").
2. Open any extension command. On first launch you land on the Login form: enter email, API client ID, API client secret, and master password. The extension runs `rbw register` (device registration) and `rbw login` (vault unlock) for you.
3. Subsequent launches detect the already-unlocked rbw-agent and skip straight to Search Vault. The Lock Vault command tears the agent down; Log Out also purges the local rbw DB.

### Self-signed certificates

If your Bitwarden / Vaultwarden server uses a self-signed certificate, set the **Self-signed CA Bundle Path** preference to a PEM file containing the CA chain. The extension exposes it to rbw via `SSL_CERT_FILE`.

## Commands

| Command | What it does |
|---|---|
| Search Vault | Browse and act on items (Copy Password / Username / TOTP, Open URL, Show Details) |
| Authenticator | TOTP codes with live countdown |
| Generate Password | UI generator (chars / diceware) |
| Generate Password (Quick) | One-shot generate-and-copy, no UI |
| Create Login | Add a login item |
| Sync Vault | Pull latest vault state from the server |
| Lock Vault | Lock the rbw agent |
| Log Out | Tear down the agent and purge the local DB |

## Removed features (vs. the bw-backed branch)

- **Bitwarden Sends.** rbw does not support Sends. Create / Search / Receive Send commands are gone.
- **Create Folder.** rbw has no folder-creation primitive. Add an item with the desired folder name in **Create Login** — the folder appears once it contains an item.

## Security

- The master password is **never** persisted.
- `rbw-agent` holds the decrypted vault in RAM under your user account. The extension does **not** maintain its own session token; it asks the agent (`rbw unlocked`) on each refresh.
- The master password is handed to rbw via a small Assuan-protocol pinentry shim that reads from `RBW_PINENTRY_VALUE` (set per-process). The shim percent-encodes `%`, CR, and LF before emitting the value, per the GnuPG Assuan spec.
- The local vault cache contains only non-sensitive fields (item names, URIs, folder ids); passwords, notes, card numbers, identity fields, and TOTP secrets are **never** cached. Sensitive fields are fetched fresh via `rbw get --raw` on demand.
- Items flagged for reprompt require the master password again before sensitive actions; the grace window is configurable (`Reprompt Grace Window` preference).
- The pinentry config swap (extension shim → rbw default) is serialized through a process-wide mutex so concurrent rbw invocations cannot observe a transient pinentry.

## Preferences

- **API Client ID / Client Secret** (required) — used by `rbw register` for device registration.
- **Path to rbw CLI** — leave empty to use `$PATH`.
- **Self-hosted Server URL** — applied via `rbw config set base_url`.
- **Self-signed CA Bundle Path** — PEM file with your CA chain. Injected as `SSL_CERT_FILE`.
- **Sync on Launch** — run `rbw sync` after the first unlock of each session.
- **Fetch Favicons** — show favicons next to login items.
- **Reprompt Grace Window** — `Always reprompt` / 30s / 1m / 5m / 15m / `Never during session`.
- **Window Action on Copy** — close the launcher or keep it open after copying.
- **Cache Vault Items** — local cache of non-sensitive fields.

## Development

```sh
bun install
bun run dev          # live reload via vici develop
bun test             # unit tests (vitest)
bun run typecheck
bun run lint
bun run build        # production build via vici
```

## License

MIT
