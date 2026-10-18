# Keysmith for Vicinae

A Vicinae extension that reads your KDE Keysmith OTP store directly. Search accounts, copy the current TOTP or HOTP code, and add new accounts without managing a second OTP database.

## Commands

- **Search OTP Codes**: searchable list of Keysmith accounts with live codes. TOTP rows show a countdown that turns red under 10 seconds. HOTP rows offer a "Use Code and Increment" action.
- **Add Account**: scan a QR image file, capture a QR code straight from the screen with Spectacle, or enter the issuer, account name, and secret manually like in Keysmith or Aegis. The account is encrypted and appended to the same `Keysmith.conf` Keysmith uses.

## Features

- Search Keysmith accounts by account name or issuer.
- TOTP codes with live countdown, HOTP codes with counter tracking.
- No network access. Codes are derived and verified on your machine.
- One subprocess, and only on request: "Scan QR from Screen" runs Spectacle to grab a screenshot.

## Requirements

- Linux. KDE Keysmith installed with a vault already set up.
- Spectacle for capturing a QR code from the screen. Everything else works without it.
- Node.js 20 or newer, `npm` for installing dependencies.

## Development setup

```bash
npm install
npm run dev
```

Other useful scripts:

```bash
npm run typecheck
npm run lint
npm run format
npm run build
```

This project uses oxlint and oxfmt. The committed `package-lock.json` is generated with `npm install` and is required for store submission.

## Configuration

The extension asks for one preference:

- `Config path`: your `Keysmith.conf` path.

Default config path:

```text
~/.config/org.kde.keysmith/Keysmith.conf
```

Your master password is not a preference. You enter it inside the extension on first launch, and you pick how long that unlock lasts.

## Unlocking and lock policies

Nothing is read until you unlock the vault. Enter your Keysmith master password once. The extension derives the vault key with Argon2id, checks it against the first account in the file, and holds the key in memory. A wrong password keeps the form open with an inline error, so you can try again instead of reloading a stale value.

You choose when the key is forgotten:

- **Every time**: the key lives in memory for the open view only and nothing is written to disk. This is the closest match to Keysmith, where you unlock the vault whenever you want a code.
- **On logout** (default, recommended): the key survives until the Vicinae daemon restarts, which tracks the login session. If the daemon start time cannot be read, it falls back to the lifetime of the extension worker.
- **On reboot**: the key survives until the machine reboots.
- **Never**: the key is written and left in place until you lock by hand or change your Keysmith password. This is the riskiest option, since the cache is only as private as `vicinae.db`.

The cached key is tied to the `master-key` salt in `Keysmith.conf`. Change your Keysmith password and the cache is dropped on the next open, so you get the unlock form again instead of an unreadable vault. Open Vault Settings from the account list to change the policy or lock right now.

### Coming from an older build

Earlier versions stored your master password as an extension preference. It is gone from the manifest now, so Vicinae stops asking for it at install. On the first unlock the extension reads that old value once to prefill the field, then ignores it.

Removing a preference does not always purge its stored value, so the plaintext password may still be sitting in Vicinae's settings database. If the Master password field is still listed in the extension preferences, clear it. Either way, the extension treats the old value as stale after the migration.

## Privacy and security

- Argon2id key derivation, secretbox decryption, and OTP calculation all run locally, with no network access. The only program the extension ever starts is Spectacle, and only when you ask it to capture the screen.
- Your master password is never stored. Under the Every time policy it is never written to disk. Under the other policies the extension caches the derived key instead, and that key only opens this one vault. It cannot unlock Keysmith, which derives its own key from the typed password.
- The cached key lives in Vicinae's local storage, which is only as private as `vicinae.db`. Database encryption is opt-in via sqlcipher, so on a default install the cache is a plaintext key on disk. Pick Every time if you would rather avoid that entirely, and treat Never as the option that accepts it permanently.
- Locking clears the cached copy. A copy of the key can still sit in the worker's heap until the process exits, so clearing the cache removes the durable copy, not every in-memory one.
- OTP secrets are held in memory only while the command view is open.
- Adding an account or incrementing an HOTP counter rewrites `Keysmith.conf` atomically through a temporary file plus rename.
- The extension will not write a new account unless it has checked the password against an existing account. A vault with no accounts gets a warning instead of a silent empty list.

## Notes

- Vicinae extensions expose the extension command in root search. Open the Keysmith command first, then search inside its list.
- Linux only. Both commands check the platform on launch and explain themselves on macOS or Windows, where `Keysmith.conf` and `/proc` do not exist.
- Every account row uses the same key glyph for now. Per-issuer brand icons are a possible future addition.

## How it works

Keysmith stores each OTP secret encrypted with libsodium `crypto_secretbox`, using a key derived from the master password with Argon2id. The parameters live in the `master-key` section of `Keysmith.conf`. This extension reimplements that read path with `libsodium-wrappers-sumo` (the sumo build is required because `crypto_pwhash` is excluded from the standard build) and computes TOTP and HOTP codes locally.

To check a password the extension opens the first account it finds. A wrong password is caught there, before the list loads and before any account is written, so it never appends an entry encrypted under a key Keysmith does not have.
