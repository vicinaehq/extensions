# Protocol reference

Byte-level notes on each protocol this extension implements, all verified against a
real YubiKey 5 (firmware 5.7.4) and the reference tools. These are the details that
are easy to get wrong and expensive to rediscover. Treat them as "here be dragons".

---

## PC/SC — `winscard_msg` {#pcsc}

`pcscd` exposes a Unix socket at `/run/pcscd/pcscd.comm` (mode `srw-rw-rw-`).

- **Framing.** Client sends `{ uint32 size, uint32 command }` followed by the struct.
  The **server replies without a header** — just the struct, and for `TRANSMIT` the
  struct followed by the response bytes. There is no correlation tag, so only one
  command may be in flight per socket: serialize with a queue.
- **Version.** Send `major=4, minor=4` (the floor accepted since 2021). The
  pcsc-lite master header says 4.6, but the Fedora daemon answered 4.5. If the server
  rejects with `SCARD_E_SERVICE_STOPPED`, its reply still carries its version;
  reconnect and re-handshake with it.
- **Listing readers.** Use `GET_READERS_STATE` (cmd `0x12`) — it always returns
  16 × 184 bytes. `SCARD_LIST_READERS` (`0x03`) has no handler in the daemon.
  **Trap:** the `readerState` field on the wire does **not** use the public
  `SCARD_STATE_*` constants. Card present is `state & 0x04` (not `0x20`, which on the
  wire means "negotiable").
- **Transactions.** `BEGIN`/`END_TRANSACTION` are required, not for exclusivity but
  to keep the `gpg-agent` from `SELECT`-ing another applet mid-sequence. `BEGIN`
  returns `SHARING_VIOLATION` immediately (it does not block); retry with a bounded
  loop (~3 s cap), not the infinite loop `libpcsclite` uses.
- **polkit.** On Fedora, `pcscd` is guarded by polkit
  (`org.debian.pcsc-lite.access_pcsc` and `access_card`). Every `SCARD_CONNECT` costs
  a D-Bus round-trip to `polkitd` (this is most of the 10–24 ms connect cost). In a
  non-active session (SSH/TTY) the socket **closes without replying** (EOF right after
  connect) — surface this as a named `not_authorized` error, not a raw `ECONNRESET`.

---

## YKOATH {#ykoath}

AID `A0 00 00 05 27 21 01`. Short APDUs are sufficient (no OATH command exceeds 255
data bytes).

- **VALIDATE.** `key = PBKDF2-HMAC-SHA1(password, salt, 1000 iterations, 16 bytes)`,
  where `salt` is the value of tag `0x71` from `SELECT`. Reply
  `HMAC-SHA1(key, challenge)`, and **verify the card's mutual response** with a
  constant-time compare — a hostile card must prove it holds the same key. Wrong
  password → SW `0x6A80`.
- **Response chaining** is mandatory: while `SW1 == 0x61`, send `00 A5 00 00 00` and
  concatenate. Without it, `CALCULATE_ALL` silently truncates once past ~255 bytes,
  losing accounts with no error.
- **`CALCULATE_ALL`** (`00 A4 00 01`, challenge = `floor(unixtime / 30)` big-endian)
  returns pairs of `0x71 <name>` then one of: `0x76` (truncated code), `0x77` (HOTP),
  or `0x7C` (touch required). **`touch_required` is only knowable from
  `CALCULATE_ALL` (tag `0x7C`)** — the `LIST` command does not carry it.
- **Non-30 s periods.** An account whose period is not 30 has the period embedded in
  its id (`"60/Issuer:name"`). `CALCULATE_ALL` returns a *wrong* code for it (the card
  used the 30 s challenge), so it must be recomputed individually with `CALCULATE`.
- **Device id.** `base64(sha256(salt)[:16])` with `=` stripped, where `salt` is the
  `0x71` tag from `SELECT`. This is the key `ykman` uses in its keystore.

---

## PIV {#piv}

AID `A0 00 00 03 08`. `SELECT` with `00 A4 04 00`.

- **Read certificate.** `GET DATA` = `00 CB 3F FF` + TLV `5C 03 <objectId (3 bytes)>`.
  Certificate object ids by slot: 9A=`0x5FC105`, 9C=`0x5FC10A`, 9D=`0x5FC10B`,
  9E=`0x5FC101`. Response is TLV `0x53 { 0x70 <DER cert> 0x71 <certInfo (1 byte)> }`.
  If `certInfo & 0x01`, the certificate is gzip-compressed (`node:zlib` `gunzipSync`).
  An empty slot returns SW `0x6A82` (FILE_NOT_FOUND).
- **PIN metadata** (YubiKey 5.3+): `00 F7 00 80 00`, response tag `0x06 =
  [default_retries, remaining_retries]`. Reading it does not consume an attempt.
- **Verify PIN:** `00 20 00 80` with the PIN as ASCII, padded with `0xFF` to 8 bytes
  (`PIN_P2 = 0x80`). On error, `SW & 0xFFF0 == 0x63C0` → `SW & 0x0F` attempts left;
  SW `0x6983` = blocked (0 left).
- **Certificate parsing.** `node:crypto` `X509Certificate` reads the DER directly:
  `.subject` / `.issuer` (multi-line, replace `\n` with `, `), `.validFrom` /
  `.validTo` (date strings), `.serialNumber`, `.fingerprint256`, `.toString()` → PEM.
- **Response chaining** on PIV uses `00 C0 00 00 <len>` (GET RESPONSE, INS `0xC0`),
  different from OATH's `0xA5`.

---

## FIDO2 / CTAP2 {#fido2}

The FIDO interface is a `/dev/hidraw` whose report descriptor starts with `06 D0 F1`
(Usage Page `0xF1D0`). It needs the FIDO udev rule (`libfido2` on Fedora/Arch,
`libu2f-udev` on Debian/Ubuntu); without it, `EACCES`.

### CTAPHID transport

64-byte packets. On Linux, the write is prefixed with report id `0x00` (65 bytes);
the read is 64.

- **Init packet:** `CID(4) + (0x80 | cmd)(1) + bcnt BE(2) + payload`.
- **Continuation:** `CID(4) + seq(1, low 7 bits) + payload`.
- `INIT` (cmd `0x06`) with an 8-byte nonce negotiates the channel id.
- `KEEPALIVE` (`0x80 | 0x3B`) means "wait" (e.g. waiting for touch) — consume it
  silently. `ERROR` = `0x80 | 0x3F`. CBOR command = `0x10`.
- A CBOR request's first byte is the command (`GET_INFO 0x04`, `CLIENT_PIN 0x06`,
  `CREDENTIAL_MGMT 0x0A`); the response's first byte is the status (`0x00` = ok).

### CBOR

CTAP2 requires **canonical** CBOR: map keys are sorted by their encoded bytes
(shorter first, then lexicographic), and every length uses the shortest form. The
YubiKey rejects non-canonical CBOR.

### PIN/UV protocol

- **v2 (preferred).** `kdf(Z) = HKDF-SHA256(Z, salt=32×0x00, info="CTAP2 HMAC key",
  32)` concatenated with `HKDF(..., info="CTAP2 AES key", 32)`. `encrypt` = random
  IV(16) + AES-256-CBC (aesKey = `key[32:]`, no padding). `authenticate` =
  HMAC-SHA256 (hmacKey = `key[:32]`).
- **v1.** `kdf = SHA256(Z)`, all-zero IV, HMAC truncated to 16 bytes.
- **ECDH.** `node:crypto` `diffieHellman({ privateKey, publicKey })` returns the X
  coordinate (32 bytes) = raw `Z`. The authenticator's COSE public key arrives as
  `{ 1:2 (EC2), 3:-25, -1:1 (P-256), -2:x, -3:y }`; rebuild it with `createPublicKey`
  from JWK.
- **getPinToken.** `GET_KEY_AGREEMENT` (subCmd `0x02`) returns the card's public key
  in result `0x01`. `pinHash = SHA256(pin)[:16]`;
  `pinHashEnc = encrypt(sharedSecret, pinHash)` (32 bytes in v2).
  `GET_TOKEN_USING_PIN` (subCmd `0x09`) with keys `3=keyAgreement`, `6=pinHashEnc`,
  `9=permissions` (`0x04` = credential management) when `pinUvAuthToken` is
  advertised; otherwise `GET_TOKEN_USING_PIN_LEGACY` (`0x05`) with no permissions. The
  token comes back encrypted in result `0x02` (48 bytes in v2); decrypt → 32 bytes.
- **Attempts.** A **correct** PIN does not consume an attempt (it resets the counter).
  A wrong one does; three in a row → `PIN_AUTH_BLOCKED` (`0x34`, needs a replug). Codes:
  `PIN_INVALID 0x31`, `PIN_BLOCKED 0x32`, `PIN_AUTH_INVALID 0x33`,
  `PIN_AUTH_BLOCKED 0x34`, `PIN_NOT_SET 0x35`.

### CredentialManagement

`pinUvAuthParam = authenticate(token, subCmd_byte ++ cbor(params))`. Request map:
`{ 1: subCmd, 2: params (a MAP), 3: protocolVersion, 4: pinUvAuthParam }`.
Subcommands: `getCredsMetadata 0x01`, `enumerateRPsBegin 0x02` / `Next 0x03`,
`enumerateCredsBegin 0x04` / `Next 0x05`, `deleteCredential 0x06`. Call
`getCredsMetadata` first: if `existing == 0`, do not enumerate (`enumerateRPsBegin`
with zero credentials errors).

**The critical bug.** The subcommand params go into the request as a **CBOR map**
(major type 5), not a byte string. Pre-encoding them into a `Buffer` and passing it
makes the encoder wrap them in a byte string (major type 2), and the card rejects
with `INVALID_PARAMETER` (`0x02`) — specifically at `enumerateCredentials`, the only
subcommand with params. Fix: pass the map as a value in the request, and encode it
*only* to compute the `pinUvAuthParam`.

**Lesson.** The offline equivalence test for `deleteCredential` "passed" because the
test was written differently from the implementation (it used the map directly).
Equivalence tests must exercise the *same code path* as the implementation, not a
parallel reproduction of it.

---

## Secret Service over D-Bus {#dbus}

- `OpenSession` with algorithm `"plain"`; `SearchItems` with `a{ss}` attributes;
  `GetSecret` returns a struct `(oayays)` where the value is index 2.
- `ykman` stores its wrap key with attributes `service=ykman`, `username=wrap_key`.
  Its keystore is `~/.local/share/ykman/oath_keys.json` (`device_id` → Fernet token).
- **Fernet** = `version(0x80) + timestamp(8) + IV(16) + ciphertext + HMAC(32)`. The
  32-byte key is `signing(16) + encryption(16)`, AES-128-CBC. The decrypted value is
  the access key as a hex string (JSON-encoded).
- **Marshalling trap.** A D-Bus array's length counts from the **first element,
  already aligned** — it does **not** include the alignment padding between the length
  (`uint32`) and the first element. Align before marking `dataStart` (writer) and
  before computing `end` (reader), or the daemon hangs with no reply.

---

## Packaging {#packaging}

`vici build` (esbuild) produces a single pure-JS bundle. No native addons (`.node`).
Only `assets/` and the compiled `src/` are packaged, so any runtime asset must live
under `assets/`. This is why the extension avoids every native dependency.
