# Keysmith for Vicinae

A Vicinae extension that reads your KDE Keysmith vault directly. Search accounts, copy the current TOTP or HOTP code, and add accounts without keeping a second OTP database.

## Commands

### Search OTP Codes

A searchable list of your Keysmith accounts with live codes. TOTP rows count down and turn red in the last 10 seconds. HOTP rows have a "Use Code and Increment" action, which saves the new counter before the code reaches the clipboard.

Vicinae puts the extension in root search, so open the Keysmith command first and search inside its list.

### Add Account

Scan a QR image file, capture a QR code from the screen with Spectacle, or type the details in like in Keysmith or Aegis. A scan fills in the account name, issuer, secret, type, algorithm, digits, and period or counter, and you can correct any of them before saving. New accounts are encrypted and appended to the same `Keysmith.conf`.

## Requirements

- Linux, with KDE Keysmith installed and a vault set up.
- Spectacle, only if you want to grab a QR code from the screen.
- Node.js 20 or newer and npm.

## Setup

```bash
npm install
npm run dev
```

Also available: `npm run typecheck`, `npm run lint`, `npm run format`, `npm run build`.

The project uses oxlint and oxfmt. The committed `package-lock.json` came from `npm install` and is required for store submission.

## Configuration

The extension has one preference, `Config path`, pointing at your `Keysmith.conf`. It defaults to:

```text
~/.config/org.kde.keysmith/Keysmith.conf
```

Your master password is not a preference. You type it in the extension on first launch and pick how long the unlock lasts.

## Lock policies

Nothing gets read until you unlock. The extension derives the vault key with Argon2id, checks it against the first account in the file, and holds the key in memory. A wrong password leaves the form open with an inline error, so you can try again.

You pick how long the key is remembered.

- **Every time.** The key lives in memory for the open view only and nothing is written to disk. This matches Keysmith, where you unlock whenever you want a code.
- **On logout, the default.** The key survives until the Vicinae daemon restarts, which tracks the login session. If the daemon start time cannot be read, it falls back to the lifetime of the extension worker.
- **On reboot.** The key survives until the machine reboots.
- **Never.** The key is written to disk and left there until you lock by hand or change your Keysmith password. This is the riskiest option, since the cache is only as private as `vicinae.db`.

The cached key is tied to the `master-key` salt in `Keysmith.conf`. Change your Keysmith password and the cache is dropped on the next open, so the unlock form comes back instead of an unreadable vault. Open Vault Settings from the account list to change the policy or lock right now.

## Security

- Argon2id key derivation, secretbox decryption, and OTP calculation all run locally, with no network access. The only program the extension starts is Spectacle, and only when you ask it to capture the screen.
- Your master password is never stored. Under Every time it is never written to disk. Under the other policies the extension caches the derived key, which only opens this one vault. It cannot unlock Keysmith, since Keysmith derives its own key from the typed password.
- The cache lives in Vicinae's local storage, which is only as private as `vicinae.db`. Database encryption is opt-in through sqlcipher, so on a default install the cache is a plaintext key on disk. Every time avoids that entirely, and Never accepts it permanently.
- Locking clears the cached copy. A copy can still sit in the worker's heap until the process exits, so clearing the cache removes the durable copy, not every in-memory one.
- OTP secrets are held in memory only while the command view is open.
- A captured QR screenshot is deleted as soon as the code has been read. If the deletion fails, the extension warns and tells you the path so you can remove it by hand.
- Adding an account or incrementing an HOTP counter rewrites `Keysmith.conf` through a temporary file holding the vault's own permissions, then renames it over the original.
- The extension will not write a new account unless it has checked the password against an existing account. A vault with no accounts gets a warning instead of a silent empty list.

## How it works

Keysmith stores each OTP secret with libsodium `crypto_secretbox`, under a key derived from the master password with Argon2id. The parameters live in the `master-key` section of `Keysmith.conf`. This extension reimplements that read path with `libsodium-wrappers-sumo`, which the standard build cannot do because it excludes `crypto_pwhash`, and computes TOTP and HOTP codes locally.

To check a password, the extension opens the first account it finds. A wrong password is caught there, before the list loads and before any account is written, so the extension never appends an entry encrypted under a key Keysmith does not have.
