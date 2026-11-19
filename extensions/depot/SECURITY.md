# Security

## Model

Depot delegates repository package management to APT, Flatpak, and Polkit:

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
  repositories, remotes, signing keys, or downloaded scripts.
- Install, remove, refresh, and update operations require an explicit user
  action. There are no background services or scheduled package operations.
- APT cancellation is offered only while aptdaemon's documented `Cancellable`
  property is true and uses its `Cancel()` method. Depot never kills a package
  manager merely to make a UI cancellation appear immediate. Flatpak and
  `pkexec` transactions therefore remain non-cancellable in the current UI.
- Completion notifications use Vicinae's native notification API and are sent
  only after an explicit operation. Notification or window-restoration failure
  never changes the package operation result.
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
  Flatpak cleanup uses only its native `uninstall --unused` operation for the
  reviewed user and system scopes and never passes `--delete-data`. AppImages
  and application data are not cleanup targets.
- Recent action history is limited to 25 local entries containing the action,
  displayed application name, backend identifier, source, and timestamp.
  Failed operations additionally keep a short summary and a bounded excerpt
  (at most 4,000 characters) of the package manager's diagnostic output, with
  credentials embedded in URLs removed. History never contains passwords, is
  stored only in Vicinae's local extension storage, and can be cleared in
  Depot.

## Reporting a vulnerability

Do not publish exploit details in a public issue. Contact the maintainer through
the GitHub account listed as the extension author (`kcnewman`) and request a private
reporting channel. Include the affected command, package source, Vicinae version,
and reproduction steps.
