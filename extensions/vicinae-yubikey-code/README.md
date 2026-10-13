# YubiKey Code for Vicinae

Native Vicinae extension for getting OATH OTP codes from a YubiKey through `ykoath`, with `ykman` fallback.

## Requirements

- Vicinae
- Node.js 20 or newer
- `ykoath` on `PATH` for the fast backend, or set the `ykoath Path` preference
- Yubico Manager CLI `ykman` on `PATH` for fallback, password-protected OATH applets, and remembered passwords

## Development

```bash
npm install
npm run dev
```

The dev script sets `XDG_RUNTIME_DIR` to `/run/user/$(id -u)` when the terminal does not already provide it, which lets `vici develop` find Vicinae's local socket.

Useful commands:

```bash
npm run typecheck
npm run lint
npm run verify
npm run clean
```

## Features

- List OATH accounts from the YubiKey
- Use the external `ykoath` helper as a fast path for account listing and exact TOTP calculation
- Fall back to `ykman` automatically for unsupported helper cases
- Copy OTP codes to the clipboard with concealed clipboard metadata
- Paste OTP codes into the active app
- Reveal a code in a detail view
- Prompt for OATH passwords when the YubiKey is password protected
- Optionally remember the OATH password using `ykman oath access remember`
- Debug timing logs for account loading, OTP fetching, and backend subprocesses

## Shortcuts

- `Enter`: run the configured primary action.
- `Shift+Enter`: reveal the OTP code in a detail view.
- `Ctrl+Enter`: paste the OTP code using Vicinae's `Clipboard.paste` API.
- `Cmd+R`: refresh accounts.

## Debugging Performance

Run the extension with `npm run dev` and watch the terminal for `[yubikey-code]` timing logs. Development sessions log automatically. For non-development runs, enable the `Debug Logging` preference.

The logs intentionally redact OTP values, passwords, and account names. OTP account references are shown as stable short hashes so related log entries can be correlated.

OTP codes are never cached.

## Publishing

Before publishing or committing, run:

```bash
npm run verify
npm run clean
```

For Vicinae store submission, place this directory at `extensions/vicinae-yubikey-code/` in a fork of `vicinaehq/extensions` and open a pull request.

## Backend

The default backend mode is `Auto: ykoath, then ykman`.

- `ykoath` is used first for fast account listing and exact TOTP code calculation.
- `ykman` is used as a fallback for password-protected applets, HOTP, unsupported helper behavior, or helper failures.
- You can force either backend with the `Backend` preference.
- You can override either executable with `ykoath Path` or `ykman Path`.

If neither backend is installed, the extension shows an error telling the user which executable could not be found.
