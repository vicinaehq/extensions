# apt-manager

Manage apt packages and repositories from [Vicinae](https://docs.vicinae.com).

## Features

Launched from the `apt` command:

- **Installed packages** — list what's installed, remove/reinstall, show info.
- **All packages** — browse the full apt cache (lazy-loaded), install on the fly.
- **Upgradable packages** — see updates, upgrade individual packages.
- **Update all** — `apt update` then `apt-get upgrade --with-new-pkgs`, with confirmation.
- **Clean up system** — `apt-get autoremove --purge` then `apt-get autoclean`.
- **Repositories** — list sources from `sources.list`/`sources.list.d` (legacy one-line
  and deb822 `.sources`), add new repos as deb822 `.sources` files, enable/disable/remove.
- **Install package files** — install a local `.deb` (via `apt`), `.flatpak`
  (via `flatpak`), or `.AppImage` file from one dialog. The extension detects
  the extension and runs the matching method.
- **AppImages** — install (from a local file) and remove AppImage applications
  installed in `~/Applications`. Download an AppImage yourself, then point the
  extension at the file; it copies it into `~/Applications` and, when
  `unsquashfs` (package `squashfs-tools`) is available, extracts its icon and
  metadata for the launcher entry. The AppImage is **never executed** during
  installation. Without `squashfs-tools`, the launcher entry uses the filename.

## How it works

- Read-only operations (`apt list`, `apt-cache show`) run without privileges.
- Every privileged operation (`install`, `remove`, `upgrade`, `cleanup`)
    is run via `pkexec`, which shows the desktop's polkit authentication dialog.
    If `pkexec` is missing you'll get a readable error plus a "Retry in Terminal (sudo)"
    action instead. Repository writes are also privileged but do not provide a terminal retry fallback; use `sudo tee` or your editor instead.
- Command output for long-running operations is shown in a result view after completion.

## Development

```bash
npm install
npm run dev        # run in development mode (requires vicinae running)
npm run build      # production bundle
npm run lint
```

## Requirements

- Debian / Ubuntu (or a resolvable) system with `apt`.
- `pkexec` (package `policykit-1`) for privileged operations — either the
  polkit agent of your desktop session or the fallback terminal action.
- Optional: `flatpak` to manage Flatpak applications and repositories. The
  Flatpak sections are hidden when the CLI is not installed.
- Optional: `squashfs-tools` (`unsquashfs`) to extract AppImage icon and
  metadata without running the file; without it AppImages are listed by their
  filename.
