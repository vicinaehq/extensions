<p align="center">
  <img src="assets/extension_icon.png" width="128" height="128" alt="KCD Connect Extension Icon" />
</p>

<h1 align="center">KCD Connect</h1>

<p align="center">
  <b>Control your phone from the Vicinae launcher, over the <a href="https://github.com/bethropolis/kcd">kcd</a> daemon socket.</b>
</p>

---

## Overview

KCD Connect talks to [**kcd**](https://github.com/bethropolis/kcd) — a headless KDE Connect
daemon — through its Unix socket at `$XDG_RUNTIME_DIR/kcd/kcd.sock`.

No `kdeconnect-cli`, no KDE dependencies, no process spawning at all. The extension opens a
socket, and that single connection carries a complete snapshot of every device you own plus
a live event stream. Your phone's battery ticks down in the list while you watch it, file
transfers report real byte progress, and a device coming back onto the network reorders the
list on its own.

## Why the socket instead of the CLI

| | `kdeconnect-cli` / `kcd` CLI | kcd socket |
| :-- | :-- | :-- |
| Cost per action | a process launch | a write to an open socket |
| Data | human-formatted tables you must regex | typed JSON |
| Live updates | poll and diff | push events |
| Transfer progress | **not observable** | `share.progress` with real byte counts |
| Offline devices | filtered out by the caller | present, with cached battery and last-seen |

The last two rows are the ones you feel. `kcd`'s `share` command returns the instant the
transfer *starts* — the bytes move in the background — so any CLI wrapper that waits for the
command to exit and then reports "sent" is reporting a lie. Only the event stream knows when
the file actually landed.

---

## Commands

| Command | What it does |
| :-- | :-- |
| **Devices** | Live control center: every device with battery, signal, now-playing and a full action panel. |
| **Send File** | Pick files, watch real transfer progress, per-device results. |
| **Send Clipboard** | Push your clipboard to a device with zero prompts. |
| **Ring Device** | Play a loud ringtone to find a device. |
| **Send SMS** | Compose a message, with contacts pulled from the phone. |
| **Media Control** | Play/pause, skip and seek whatever your phone is playing. |
| **Pair Device** | Discover nearby devices and pair, with verification-key confirmation. |

---

## Multi-device

Most launcher integrations handle a second device badly: they ask which one you meant, every
single time, and they hide anything that is currently offline. KCD Connect is built the other
way around.

**It asks only when the answer is genuinely ambiguous.** Every action resolves its target
through a ladder, stopping at the first hit:

1. A device named explicitly in the command's arguments or deeplink.
2. Your **pinned default**, if it is connected. Set it with *Set as Default Device* in the
   Devices command.
3. The **device you used last**, if it is connected.
4. The **only connected device** — one phone means zero prompts, always.
5. Otherwise, and only then, a picker.

So with one phone it behaves exactly like a single-device tool. With three, it quietly keeps
using the one you actually use, and still lets you override per action.

**Offline devices are shown, not hidden.** A device that is off-network stays in the list,
dimmed, labelled `Offline · last seen 7m ago`, with its last known battery level. Acting on
it tells you it is offline instead of failing silently. "Where did my phone go?" is a worse
experience than "your phone is offline."

**Broadcast is honest.** *All Devices* fans out to every connected device and reports what
really happened — `Sent to 2 of 3 · Tablet failed: device not connected` — rather than
claiming success because one leg worked.

**One connection feeds every view.** A single `watch` stream per command yields the full
device snapshot on open and live updates after, so nothing polls and no view renders stale
state.

---

## Prerequisites

1. **kcd** installed and running:

   ```bash
   systemctl --user enable --now kcd
   ```

2. Your phone paired with this computer, on the same network. Check with:

   ```bash
   kcd status
   ```

3. The **KDE Connect** app on your phone (kcd speaks the standard KDE Connect protocol, so
   the regular Android/iOS app works).

If the daemon is not running, every command says so and tells you how to start it.

---

## Preferences

| Preference | Default | Purpose |
| :-- | :-- | :-- |
| **Socket Path** | `$XDG_RUNTIME_DIR/kcd/kcd.sock` | Override if you moved `socket_path` in `~/.config/kcd/kcd.toml`. |

---

## Not included, and why

- **Send Text** — kcd can *receive* shared text but exposes no route to send it. Its only
  share command takes a file path, and `clipboard_push` reads your real system clipboard, so
  a "send text" would have to clobber your clipboard to work. Use **Send Clipboard** instead.
- **Run Command** — kcd forwards the remote-command list request to the phone, but the reply
  has no event on the daemon's bus, so a client cannot read the list back. A command picker
  cannot be built correctly against the current daemon.
- **SMS conversation browsing** — reading threads means correlating raw `sms.incoming`
  packets. Sending works; reading is a separate feature.

---

## Development

```bash
npm install
npm run dev          # live reload into Vicinae
npm run check        # biome format + lint, with fixes
npm run lint         # manifest validation
npm run build
```

With `npm run dev` running, the extension hot-reloads. To jump straight into a command
instead of searching for it:

```bash
vicinae cmd launch @dagimg-dot/kcd-connect:devices
```

`vicinae cmd ls` lists every loaded command id.

---

## Credits

- **[Vicinae](https://www.vicinae.com/)** — the launcher.
- **[kcd](https://github.com/bethropolis/kcd)** — headless KDE Connect daemon by
  [bethropolis](https://github.com/bethropolis).
- **[KDE Connect](https://kdeconnect.kde.org/)** — the protocol.
