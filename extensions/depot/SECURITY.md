# Security

## Model

Depot delegates repository package management to APT, Flatpak, and Polkit, and
uses narrowly scoped file operations for local AppImages:

- Depot is Linux-only and targets Ubuntu's standard APT/dpkg layout first.
  Privileged tools use fixed `/usr/bin` paths rather than a mutable `PATH`.
- Package identifiers are validated and passed as subprocess arguments with
  shell execution disabled.
- AppStream metadata is read locally, used only for display and ranking, and
  never evaluated as code. Homepage actions still accept only HTTP(S) URLs.
- APT keeps its normal repository signature and trust checks.
- Polkit owns privileged authentication; the extension never receives or stores
  passwords. Authorization lifetime and repeated prompts are controlled by the
  system's Polkit policy; Depot does not install or modify policy rules.
- APT repository installs, removals, and cache refreshes prefer the
  distribution-provided, demand-activated aptdaemon D-Bus service when it is
  installed. One connection is opened on demand for the active command and is
  never a background service; a failed or closed connection is discarded and
  a transaction whose daemon disappears is reported as failed rather than left
  waiting. Systems without aptdaemon fall back to direct `pkexec` + APT. APT
  upgrades and local `.deb` files always use that direct guarded path: aptdaemon
  2.0.2 can leave `UpgradePackages` transactions indefinitely queued, and it
  rejects files staged by an extension. Both paths preserve explicit arguments
  and APT's simulation guard, and simulations use the same arguments as the
  authenticated command.
- Depot asks aptdaemon to simulate pending installs and removals, then validates
  its package groups before calling `Run()`. Installs are blocked if the
  resolver proposes any removal; removals are blocked if anything beyond the
  selected package would be removed. Direct APT upgrades simulate first and use
  `--no-remove --only-upgrade` in both the simulation and authenticated command.
  Other `pkexec` fallbacks retain their direct APT simulations and removal-plan
  validation.
- For aptdaemon transactions, Depot checks the exact documented Polkit action
  (`install-or-remove-packages` or `update-cache`) with
  `pkcheck` while the read-only simulation runs. The check identifies the
  extension process using PID, process start time, and UID. It distinguishes a
  dismissed prompt (silent cancellation), a denial, and a missing
  authentication agent, but cannot alter packages; aptdaemon still performs its
  own authorization check before the validated transaction is queued. For
  direct `pkexec`, exit status 126 is treated as cancellation and 127 as
  denial.
- Safety-relevant simulations must be read completely. Output that exceeds
  Depot's bounded limit rejects the operation instead of being treated as a
  shorter plan.
- Package identities are compared in APT's form. dpkg's native-architecture
  qualifier (for example `:amd64`) is normalized away, while foreign
  architectures stay qualified, so a removal that would also remove another
  architecture of the same package is still blocked.
- Only existing APT sources and Flatpak remotes are used. Depot never adds
  repositories, remotes, signing keys, or downloaded scripts during search.
  A selected `.flatpakref` may add only the remote declared in that file, after
  Depot displays its URL and the user explicitly confirms.
- Local package paths are absolute subprocess arguments. Extensions are hints,
  not proof of format, and selected symbolic links are rejected.
- Reviewed local files are installed from an immutable staged copy, never from
  the original path. Each install creates a fresh `mkdtemp` directory under the
  system temporary directory (mode 0711 for `.deb` so APT's unprivileged
  `_apt` helper can enter but not list it, 0700 otherwise). The source is
  opened with `O_NOFOLLOW` and copied with an exclusive create; the copy is
  hashed while writing, must match the SHA-256 taken at inspection, and is then
  made read-only (0444 for `.deb`, 0400 otherwise) under a fixed name such as
  `package.deb`. The staged file and directory are removed after success or
  failure, and a best-effort sweep removes stale `depot-install-*` directories
  owned by the current user that are older than 24 hours.
- Local `.deb` files are inspected with `dpkg-deb`, compared against the
  installed version with `dpkg --compare-versions`, and installed with
  `pkexec /usr/bin/apt --yes --no-remove install -- <staged>/package.deb` after
  the same command's simulation succeeds. Reinstalling the same version and
  downgrades are blocked before confirmation, and the installed version must
  match the reviewed version afterwards.
- AppImages are untrusted local executables. Inspection validates the AppImage
  header and payload structure (magic bytes, not embedded GPG signatures) and
  extracts Type 2 metadata with `unsquashfs`; it never
  executes the selected AppImage. Integration copies it to `~/Applications`
  and creates its desktop entry under `XDG_DATA_HOME/applications` (or the
  standard `~/.local/share/applications` fallback) without auto-launching it.
- AppImage desktop entries use a newly generated, quoted `Exec` value pointing
  only to the managed copy. Embedded `Exec` commands are ignored. Embedded icons
  are size-bounded and accepted only after PNG signature validation.
- Every AppImage file created by Depot is recorded in small versioned metadata
  under Vicinae's extension support directory. Failure cleanup and future
  removal are limited to exact recorded paths; application data directories are
  never guessed or recursively deleted.
- Depot Manage scans only direct regular files in `~/Applications`, validates
  AppImage structure before display, and rejects symbolic links. Launch executes
  the validated absolute AppImage path with no arguments, no shell, and a
  detached child process only after an explicit action.
- Removal revalidates the selected file and moves it to Trash. A valid Depot
  ownership record can additionally authorize only its exact desktop entry,
  icon, and record paths. External AppImages receive file-only removal; Depot
  never guesses another tool's integration files or application-data paths.
- Package bundles contain validated APT and Flatpak identifiers only. They
  cannot contain scripts, hooks, repository changes, or executable fields.
- Software profiles are untrusted data. Depot accepts only bounded, regular
  JSON files using documented version 1 fields and rejects symbolic links,
  unknown fields, duplicate entries, unsafe identifiers, and path-bearing
  AppImage filenames. Imported profiles are never executed or copied into a
  trusted store.
- Profile installation occurs only after package availability is reviewed,
  entries are selected, and the user confirms the transaction. AppImage
  records without a trusted reproducible source are marked for manual action;
  Depot never derives a download URL from their names.
- Install, remove, refresh, and update operations require an explicit user
  action. There are no background services or scheduled package operations.
- APT cancellation is offered only while aptdaemon's documented `Cancellable`
  property is true and uses its `Cancel()` method. Depot never kills a package
  manager merely to make a UI cancellation appear immediate. Flatpak and
  `pkexec` transactions therefore remain non-cancellable in the current UI.
- Completion notifications use Vicinae's native notification API and are sent
  only after an explicit operation. Notification or window-restoration failure
  never changes the package operation result.
- Installed applications are launched only from package-manager desktop entries
  discovered in fixed APT or Flatpak locations. Depot passes the absolute
  desktop-file path to the fixed `/usr/bin/gio` executable as an argument and
  never evaluates or reconstructs its `Exec` field.
- APT removal is limited to visible, manually installed applications and is
  blocked when its simulation would remove additional packages. Depot runs a
  read-only preview before confirmation so those consequences are visible
  without authentication, then revalidates the plan inside the real transaction
  in case package state changed.
- Update All keeps APT and Flatpak as independent transactions. Failure in one
  backend does not combine commands, manipulate another backend's database, or
  bypass its native safety behavior. APT updates exclude packages held with
  `apt-mark hold` and updates Ubuntu is still phasing in, so Depot never
  installs what `apt-get upgrade` would deliberately hold back.
- System cleanup is explicit and review-first. APT's `autoremove --purge` plan
  is simulated before confirmation and checked for protected packages. The
  authenticated operation purges exactly the reviewed package IDs with
  `apt-get --yes --no-auto-remove purge -- <ids>`, after simulating that same
  command and requiring its removal set to equal the reviewed set; any change
  is rejected and requires a fresh review. `autoclean` runs only when the
  preview found archives APT considers obsolete.
  Flatpak previews unused runtimes with a declined `uninstall --unused`,
  resolves each to one exact installed runtime ref (including architecture),
  and rechecks the reviewed set immediately before each scope is cleaned.
  Changes require a fresh review. Removal uses only explicit reviewed refs
  with `--runtime --no-related`, so it cannot expand to newly unused runtimes
  or related extensions. It never passes `--delete-data`. AppImages and
  application data are not cleanup targets.
- Recent action history is limited to 25 local entries containing the action,
  displayed application name, backend identifier, source, and timestamp.
  Failed operations additionally keep a short summary and a bounded excerpt
  (at most 4,000 characters) of the package manager's diagnostic output, with
  credentials embedded in URLs removed. History never contains passwords, is
  stored only in Vicinae's local extension storage, and can be cleared in
  Depot.

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
the GitHub account listed as the extension author (`kcnewman`) and request a private
reporting channel. Include the affected command, package source, Vicinae version,
and reproduction steps.
