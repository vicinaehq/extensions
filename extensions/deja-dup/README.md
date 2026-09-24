# Déjà Dup Backups

Browse, search and restore files from your [Déjà Dup](https://wiki.gnome.org/Apps/DejaDup)
backups directly from [Vicinae](https://vicinae.com) — without opening the GUI.

Déjà Dup 45+ stores its backups as a [restic](https://restic.net) repository. This extension
talks to that repository read-only, reusing the credentials Déjà Dup already saved, so there is
nothing to configure.

## Commands

- **Browse Backup** — list snapshots, drill into the file tree, preview a file, and restore
  individual files or folders (to their original location or anywhere you choose).
- **Search Backup Files** — build a small local index of your latest backup once, then search it
  instantly and offline (searching a cloud backup file-by-file is far too slow otherwise).
- **Back Up Now** — start a fresh backup, and see the last backup, destination, schedule and
  included/excluded paths.

## Supported backends

| Backend | Status | Notes |
| --- | --- | --- |
| Local folder | ✅ | |
| Removable drive | ✅ | drive must be connected/mounted |
| Network server | ✅ | SMB, SFTP, WebDAV/Nextcloud — mount it once in Files first |
| Google Drive | ✅ | |
| OneDrive (Personal) | ✅ | |
| rclone remote | ✅ | uses your `rclone.conf` |

Backups made with **duplicity** or **borg** (older Déjà Dup, or an explicit choice) are not
readable by this extension — only restic backups are.

## Installation flavor (native / Flatpak / Snap)

The extension auto-detects how Déjà Dup is installed and adapts:

- **Native** (system package) and **Snap** (classic confinement) — full support, all backends.
- **Flatpak** — Déjà Dup's config and passwords live in the app's sandbox, unreachable from
  outside. Local, network and drive backups work if you enter your backup password under
  **Backup Password** in the extension settings; cloud backups (Drive/OneDrive/rclone) keep their
  tokens in the sandboxed keyring and need the native or Snap Déjà Dup.

You can override the detected flavor and set custom binary paths / the backup password under the
extension's preferences (⌘/Ctrl+,) if your setup is unusual.

## Requirements

- Déjà Dup with a restic backup already configured and run at least once
- `restic` and (for cloud backends) `rclone` available on `PATH`
- The GNOME keyring unlocked (open Déjà Dup once after login so the password/token are available)

All access is **read-only** on the repository (`restic --no-lock`); the extension never prunes,
forgets or writes to your backup. Restores only ever create new files in the target directory.

## How it works

Configuration (backend, target folder, schedule) is read from GSettings
(`org.gnome.DejaDup`). The repository password comes from the keyring
(`secret-tool lookup owner deja-dup type passphrase`). For Google Drive, Déjà Dup's own OAuth
refresh token is read from the keyring and exchanged for a short-lived access token, which is
cached in the extension's support directory until it expires.

## License

MIT
