# Architecture

This extension talks to a YubiKey from a Vicinae extension (TypeScript + React on
the `vicinae-node` runtime). It speaks every YubiKey protocol **natively**, with no
external dependencies: no `ykman`, no `yubikit`, no Python, no native addons. The
only runtime requirement is a running `pcscd` (present on virtually every Linux
desktop), plus the standard FIDO udev rule for the passkey screen.

## Why native

The first working version shelled out to a persistent Python helper built on
`ykman`/`yubikit`. It worked, but it cost:

| | Python helper | Native |
|---|---|---|
| Extra RAM | **58 MB RSS** (a dedicated process) | ~0 (runs inside `vicinae-node`, which already exists) |
| Cold start | ~500 ms (import + device enumeration) | none (no process to spawn) |
| Per operation | ~50 ms | **~10 ms** (the card itself answers in ~0.6 ms) |
| Install requirements | Python + `ykman` + `yubikit` + `fido2` | **none** beyond `pcscd` |

Profiling showed the real cost of a smart-card APDU round-trip is ~0.6 ms; **98 % of
the old latency was Python startup**. Requiring users to install a Python stack was
also the single biggest barrier to publishing the extension. Removing it solved the
performance problem and the distribution problem at once.

The full rationale for each decision lives in [decisions.md](./decisions.md). The
hard-won, byte-level protocol details live in [protocols.md](./protocols.md).

## Transports

A YubiKey exposes its applications over two different physical interfaces:

- **CCID (smart card)** carries OATH, PIV and OpenPGP. Reached through `pcscd` over
  its Unix socket, speaking the `winscard_msg` wire protocol directly.
- **HID (`CTAPHID`)** carries FIDO2/U2F. Reached by opening the raw `/dev/hidraw`
  device for the FIDO interface and framing CTAPHID packets.

FIDO2 does **not** ride on CCID over USB, so the two screens use two different
transports under the hood.

## Module map

```
src/
├── otp-codes.tsx        Command 1: TOTP codes (view)
├── security-keys.tsx    Command 2: FIDO2 passkeys + PIV certificates (view)
└── lib/
    ├── pcsc.ts          winscard_msg client: talks to pcscd over its Unix socket
    ├── ykoath.ts        YKOATH protocol: SELECT / LIST / CALCULATE_ALL / VALIDATE
    ├── oath-session.ts  OATH session (owns a reused PC/SC connection)
    ├── piv.ts           PIV protocol: certificate read, PIN metadata
    ├── piv-session.ts   PIV session (fresh connection per operation)
    ├── hid.ts           CTAPHID transport over /dev/hidraw
    ├── cbor.ts          Canonical CTAP2 CBOR encode/decode
    ├── ctap2.ts         CTAP2: getInfo, ClientPin (PIN protocol v1/v2), CredMgmt
    ├── fido-session.ts  FIDO2 session that the UI consumes
    ├── dbus.ts          Minimal D-Bus client (zero dependencies)
    ├── secrets.ts       OATH access key via Secret Service + ykman keystore import
    ├── clipboard.ts     Paste-to-focused-field + clipboard-history purge
    ├── progress-icon.ts Pre-computed countdown-ring data URIs
    └── touch.ts         Touch-required OATH flow (second PC/SC socket)
```

Each protocol is layered: a low-level transport (`pcsc.ts`, `hid.ts`), a protocol
codec on top (`ykoath.ts`, `piv.ts`, `ctap2.ts`), and a thin session object the
React commands call (`oath-session.ts`, `piv-session.ts`, `fido-session.ts`).

## Connection strategy

**OATH (hot path).** The OTP screen keeps a single PC/SC connection open with an
idle timeout of 60 s, and wraps every logical operation in a PC/SC transaction. The
transaction is not about performance or exclusivity: without it, the `gpg-agent`
could `SELECT` a different applet in the middle of our
`SELECT → VALIDATE → CALCULATE_ALL` sequence and hand us garbage. The transaction
lasts a few milliseconds; anything that collides with it gets `SHARING_VIOLATION`
and its own `libpcsclite` retries transparently.

**PIV and FIDO2 (cold paths).** The keys screen is opened rarely, so PIV and FIDO2
open a connection per operation and close it immediately. Reading a certificate or
the PIN state costs ~10 ms either way, and this never holds the card while the
screen is idle.

**Touch-required OATH** runs on a *separate* PC/SC socket, because a touch
`CALCULATE` blocks the transaction for up to ~15 s (see the note on the touch flow
below) and would otherwise freeze the list.

## Two commands, two screens

Vicinae has no in-window tabs, so the two screens are two independent commands:

- **YubiKey: OTP Codes** — the code is the row title (large, tabular), the account
  is the subtitle, and a countdown ring sits on the right. Enter closes the window,
  pastes the code into whatever field was focused, then purges the entry from the
  Vicinae clipboard history. Touch-required accounts paste nothing until the key
  responds.
- **YubiKey: Keys & Certificates** — FIDO2 passkeys (enumerate, copy id, delete)
  and PIV slots/certificates (view, export PEM). PIN is asked in-app and kept only
  in the command's memory, never on disk or in a process argument.

## Security posture

- **Secrets never touch `argv`.** The old Python helper received the PIN on the
  command line, exposing it in `/proc/<pid>/cmdline` to any local process. The
  native code passes nothing sensitive through arguments.
- **The OATH access key is stored in the Secret Service** (gnome-keyring / KWallet)
  via D-Bus, matching what `ykman` does. It is imported transparently from `ykman`'s
  own keystore when present, so a user who already ran `ykman oath ... -r` never
  sees a password prompt. See [decisions.md](./decisions.md#oath-access-key-storage).
- **FIDO2 PIN crypto was validated offline** against the reference library, byte for
  byte, before any real PIN was ever sent to the card. A wrong `pinHashEnc` would
  burn a PIN attempt, and three in a row lock the FIDO2 application. See
  [decisions.md](./decisions.md#fido2-pin-safety).
- **Pasting a code writes it to the Vicinae clipboard history** in plaintext, because
  `Clipboard.paste()` has no `concealed` flag (only `Clipboard.copy()` does). The
  extension purges that entry immediately after pasting, and degrades gracefully if
  the Vicinae schema ever changes. See
  [decisions.md](./decisions.md#clipboard-history-purge).

## The touch limitation (and why it is unavoidable)

When a touch-required OATH code is requested, the `CALCULATE` APDU reaches the card
and the applet then waits for a finger, ignoring everything else until its internal
timeout (~15 s). This cannot be aborted in software: `SCardCancel`,
`SCARD_RESET_CARD`, `SCARD_UNPOWER_CARD` and even a USB device reset were all tested
and all fail, because the touch timer runs in the key's firmware and the USB port
never cuts VBUS. Only touching the key, or unplugging it, ends the wait early.

The UI is built around this: cancelling a touch does not try to abort it. It marks a
cooldown, keeps showing the cached codes, and tells the user that touching the key
frees it now. When the card frees up (by touch or timeout), the screen refreshes on
its own.
