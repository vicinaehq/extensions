# Snapper Snapshots

Browse, create and inspect [Snapper](http://snapper.io) Btrfs snapshots from
[Vicinae](https://vicinae.com). Works with the same snapshots that
[Btrfs Assistant](https://gitlab.com/btrfs-assistant/btrfs-assistant) manages.

## Commands

- **Browse Snapshots** — list Snapper configs and their snapshots, and view which files changed
  between a snapshot and the current system.
- **Create Snapshot** — take a new snapshot of any config with a description.
- **Search Snapshot Files** — instant local file search inside any snapshot's read-only mount
  (fast because it's plain local disk, no network).

## First run: granting access

Snapper only lets `root` read snapshots by default, so the first time you open **Browse
Snapshots** or **Create Snapshot** without access, the extension shows a one-tap **Set Up Access**
screen. It runs once via `pkexec` (a single admin-password prompt) and adds your user to
`ALLOW_USERS` with `SYNC_ACL=yes` in each Snapper config — exactly the mechanism Snapper documents
for non-root use. Confirmation is shown as a system notification, so you'll see it even though the
polkit dialog closes the launcher window.

After that, listing, creating and inspecting snapshots all work **without any further password
prompts**. Your existing `ALLOW_USERS` entries are preserved. If access is ever lost, the same
screen reappears automatically.

## Requirements

- `snapper` installed and at least one config (Btrfs Assistant sets these up)
- `pkexec` (polkit) for the one-time access setup
- `btrfs-assistant` optional — offered as a launcher for privileged operations like full
  subvolume rollbacks, which this extension deliberately leaves to the GUI

## Scope

This extension focuses on inspecting and managing snapshots. Restoring a whole subvolume (a
rollback) is intentionally left to Btrfs Assistant, since it is a privileged, potentially
destructive operation. Individual files can be recovered from a snapshot's read-only mount under
`.snapshots/<n>/snapshot/` once access is set up.

## License

MIT
