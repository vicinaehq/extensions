# Architecture decisions

Decision records for the choices that shaped this extension. Each states the
context, the decision, and its consequences, so a future contributor understands
*why* the code looks the way it does before changing it.

---

## ADR 1 — Native protocol stack, no Python

**Context.** The first version used a persistent Python helper (`ykman` / `yubikit`)
bundled as `assets/bridge.py`. It cost 58 MB RSS, ~500 ms cold start and ~50 ms per
operation, and it required users to install a Python stack. Profiling showed the
card answers an APDU in ~0.6 ms, so almost all latency was Python startup.

**Decision.** Reimplement every protocol in pure TypeScript on Node's standard
library (`node:net`, `node:crypto`, `node:fs`, `node:zlib`). No `ykman`, no
`yubikit`, no Python, no native `.node` addons (the `vici build` esbuild step
produces a single JS bundle; a native addon would need per-arch prebuilds and break
distribution).

**Consequences.** RAM extra ~0, per-op latency ~10 ms, zero install requirements
beyond `pcscd`. The cost is that we now own low-level protocol code (PC/SC, YKOATH,
PIV, CTAP2, CBOR, D-Bus). That code is documented in
[protocols.md](./protocols.md) and covered by the validation described below.

---

## ADR 2 — Talk to `pcscd` directly over its Unix socket

**Context.** OATH and PIV ride on CCID, reached through `pcscd`. The options were a
native binding to `libpcsclite` (needs a compiled addon, breaks the single-bundle
build) or reimplementing the `pcscd` wire protocol.

**Decision.** Speak the `winscard_msg` protocol directly over
`/run/pcscd/pcscd.comm`.

**Consequences.** Zero dependencies, but we depend on protocol stability. Mitigated
by negotiating protocol version `4.4` (the floor accepted by every `pcscd` since
2021) and re-handshaking with the server's version if it rejects. Errors are mapped
to named, actionable causes (no daemon, polkit refusal, `scdaemon` holding the
reader, missing CCID driver). Details in [protocols.md](./protocols.md#pcsc).

---

## ADR 3 — OATH access key storage {#oath-access-key-storage}

**Context.** When the OATH application has a password, unlocking it needs a derived
16-byte access key. It is a secret (it generates codes while the key is plugged in),
so it must not sit in plaintext on disk. Vicinae's own `LocalStorage` / `Cache` are
plaintext SQLite, so they were ruled out.

**Decision.** Store the access key in the **Secret Service** (gnome-keyring /
KWallet) via a hand-written, zero-dependency D-Bus client. Additionally, import it
opportunistically from `ykman`'s own keystore: read
`~/.local/share/ykman/oath_keys.json`, fetch `ykman`'s wrap key from the Secret
Service, and decrypt the Fernet token — all in `node:crypto`.

**Consequences.** A user who already ran `ykman oath ... -r` never sees a password
prompt. When no Secret Service is available (e.g. a bare sway/Hyprland session), the
key stays in memory for the session; persisting it in plaintext is offered only
behind an explicit, off-by-default preference, never silently. Only the derived key
is ever stored, never the password. See
[protocols.md](./protocols.md#secret-service).

---

## ADR 4 — Write the D-Bus client by hand

**Context.** The Secret Service is reached over D-Bus. The pure-JS libraries
(`@homebridge/dbus-native`) pull in a dependency tree (`event-stream`, `xml2js`)
that is undesirable in a security-sensitive extension; the fast library (`dbus-next`)
depends on the native `usocket` addon, which the esbuild bundle cannot package.

**Decision.** Implement the small subset of D-Bus we need by hand (`dbus.ts`): SASL
`EXTERNAL` handshake and little-endian marshalling of the handful of types the
Secret Service uses.

**Consequences.** Zero dependencies and full control over how a live credential is
handled. The cost is owning the marshalling code, whose one genuine subtlety (array
length excludes the alignment padding before the first element) is documented in
[protocols.md](./protocols.md#dbus).

---

## ADR 5 — PIV is read-only in v1

**Context.** Reading PIV certificates needs only public data. Writing (generate key,
import/delete certificate) requires the management key, whose negotiation is a
mutual 3DES/AES-192 challenge, and on many keys the management key is itself
PIN-protected and stored in a separate PIV object.

**Decision.** Ship PIV read-only: list slots, view certificate metadata, export PEM.
Leave certificate deletion and key generation out of v1.

**Consequences.** The keys screen is useful and safe immediately, using
`node:crypto`'s `X509Certificate` and `node:zlib` for gzip-compressed certificates.
Management-key operations can be added later without reworking the read path.

---

## ADR 6 — FIDO2 PIN safety {#fido2-pin-safety}

**Context.** FIDO2 passkeys live on the HID interface and require the PIN protocol
(ECDH P-256, HKDF, AES-256-CBC, HMAC-SHA256). A bug in the PIN-hash encryption burns
a PIN attempt, and three consecutive wrong attempts lock the FIDO2 application until
the key is unplugged and reinserted.

**Decision.** Validate the entire PIN-protocol crypto **offline against the reference
`fido2` library, byte for byte**, before ever sending a real PIN to the card. ECDH is
symmetric, so a test can derive the shared secret on both sides from a fixed
authenticator key and compare; `authenticate` and `encrypt`/`decrypt` are then
deterministic and directly comparable.

**Consequences.** The first real PIN send was correct on the first try and consumed
no attempt. A live-flow bug (subcommand params encoded as a CBOR byte string instead
of a map) was still found afterwards, via side-by-side traffic logging against the
reference — but it was structural, not a PIN-hash error, so it never risked the
counter. Lesson recorded in [protocols.md](./protocols.md#fido2).

---

## ADR 7 — Clipboard history purge {#clipboard-history-purge}

**Context.** The primary OTP action pastes the code into the focused field. But
`Clipboard.paste()` has no `concealed` flag (only `Clipboard.copy()` does), so
pasting writes the code into Vicinae's clipboard history (`clipboard.db`, including
its full-text index) in plaintext, searchable forever.

**Decision.** After pasting, delete that history entry — the row, its on-disk blob,
and the FTS index — matching by the MD5 of the content, so the code never passes
through SQL or another process's `argv`. Only recent entries are eligible, so an
older entry with the same text is never touched.

**Consequences.** Codes do not linger in the clipboard history. This reaches into
Vicinae's internal database, so if the schema changes in an update the purge logs a
warning and gives up rather than breaking the paste. The clean fix is upstream: an
issue asking for a `concealed` option on `Clipboard.paste()`, which would delete
this whole module. Tracked as a pre-publish task.

---

## ADR 8 — Two commands, not a dropdown

**Context.** The two screens (OTP, keys) are distinct workflows. Vicinae has no
in-window tabs.

**Decision.** Expose two independent commands in the manifest
(`YubiKey: OTP Codes`, `YubiKey: Keys & Certificates`), each launchable and
bindable to its own global shortcut.

**Consequences.** The idiomatic Vicinae/Raycast shape: fast access, each screen
independently reachable, at the cost of two entries in the launcher instead of one.
