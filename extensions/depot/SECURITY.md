# Security

## Model

Depot delegates repository package management to APT, Flatpak, and Polkit, and
uses narrowly scoped file operations for local AppImages:

- Package identifiers are validated and passed as subprocess arguments with
  shell execution disabled.
- AppStream metadata is read locally, used only for display and ranking, and
  never evaluated as code. Homepage actions still accept only HTTP(S) URLs.
- APT keeps its normal repository signature and trust checks.
- Polkit owns privileged authentication; the extension never receives or stores
  passwords. Authorization lifetime and repeated prompts are controlled by the
  system's Polkit policy; Depot does not install or modify policy rules.
- Only existing APT sources and Flatpak remotes are used. Depot never adds
  repositories, remotes, signing keys, or downloaded scripts during search.
  A selected `.flatpakref` may add only the remote declared in that file, after
  Depot displays its URL and the user explicitly confirms.
- Local package paths are absolute subprocess arguments. Extensions are hints,
  not proof of format, and selected symbolic links are rejected.
- AppImages are untrusted local executables. Inspection checks AppImage and
  payload signatures and extracts Type 2 metadata with `unsquashfs`; it never
  executes the selected AppImage. Integration copies it to `~/Applications`
  and does not auto-launch it.
- AppImage desktop entries use a newly generated, quoted `Exec` value pointing
  only to the managed copy. Embedded `Exec` commands are ignored. Embedded icons
  are size-bounded and accepted only after PNG signature validation.
- Every AppImage file created by Depot is recorded in small versioned metadata
  under Vicinae's extension support directory. Failure cleanup and future
  removal are limited to exact recorded paths; application data directories are
  never guessed or recursively deleted.
- Install, remove, refresh, and update operations require an explicit user
  action. There are no background services or scheduled package operations.
- Completion notifications are sent only after an explicit operation, through a
  one-shot `notify-send` subprocess with shell execution disabled. Notification
  failure never changes the package operation result.
- APT removal is limited to visible, manually installed applications and is
  blocked when its simulation would remove additional packages.

## Local-file trust

Package metadata, descriptions, homepage URLs, Flatpak references, and AppImage
desktop metadata are treated as untrusted data. They are never evaluated as
code. Homepage actions accept only HTTP(S), package identifiers are validated,
and all external programs receive explicit argument arrays with shell execution
disabled.

Depot validates packaging structure, not publisher identity. A valid local
`.deb`, Flatpak bundle/reference, or AppImage can still contain malicious
software. The review screen accurately labels these as local files and requires
confirmation before installation or integration.

## Reporting a vulnerability

Do not publish exploit details in a public issue. Contact the maintainer through
the GitHub account listed as the extension author (`oo7kc`) and request a private
reporting channel. Include the affected command, package source, Vicinae version,
and reproduction steps.
