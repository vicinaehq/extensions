# Depot for Vicinae

Install, remove, and update APT and Flatpak applications without leaving
Vicinae.

**Depot: Install** → type `vlc` → choose APT or Flatpak → press Enter.

![Search APT and Flatpak together](assets/install.png)

## Commands

- **Install** searches configured APT repositories and Flatpak remotes together.
- **Remove** lists installed desktop applications and confirms every removal.
- **Update** shows available updates and supports individual or Update All
  actions.

APT and Flatpak choices remain separate and clearly labeled. Results stay
keyboard-first, searchable, and native to Vicinae.

![Review available updates](assets/update.png)

## Highlights

- Unified APT and Flatpak search
- Friendly application names, summaries, and icons from local AppStream metadata
- Installed-state detection and package details
- Graphical Polkit authentication for APT operations
- User- or system-scoped Flatpak support
- Conservative APT removal safeguards
- No daemon, polling, background refresh, or private package index

## Requirements

- Vicinae 0.28.1
- Ubuntu or another Debian-based distribution using APT
- Polkit and `pkexec` for authenticated APT operations
- Flatpak with a configured remote, if Flatpak support is wanted

Flatpak is optional. Without it, Depot continues as an APT-only extension.
AppStream enrichment is also optional; if local AppStream metadata or its CLI is
unavailable, Depot immediately falls back to package-manager results.
The current release candidate is validated on Ubuntu 26.04 amd64.

## Search and performance

Depot queries only enabled package managers after at least two characters are
entered. Search is debounced, bounded, and cancelled when the query changes or
the command closes. APT, Flatpak, and local AppStream metadata run independently,
so friendly names and icons can appear progressively without delaying raw search
results. Richer descriptions, categories, and license metadata are requested only
when a user opens an item's details.

AppStream uses the operating system's existing local metadata and cache. Depot
does not download a catalogue, build its own package database, run a daemon, or
perform work while Vicinae is idle.

## Security

Depot uses only repositories and Flatpak remotes already configured on the
machine. It never adds repositories, imports keys, stores passwords, invokes a
shell, or performs package operations without an explicit user action.

See [SECURITY.md](SECURITY.md) for the security model and reporting guidance.

## Development

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

Use `npm run dev` while Vicinae is running for live extension development.

## Compatibility

Supported: Ubuntu and Debian-based systems using APT, with optional Flatpak.

Not supported: Snap, DNF, pacman/AUR, Nix, and Homebrew.

Known limitations:

- APT results use package metadata, so some names are less polished than a full
  software center when AppStream has no matching application component.
- AppStream enrichment is best-effort and intentionally does not fetch remote
  icons or screenshots.
- The first Flatpak search can be slower while the Flatpak CLI queries remotes.
- Packages requiring terminal-based configuration may not install successfully.
