# Contributing to Depot

Depot is intentionally small: a native Vicinae interface over Linux software
tools, not a replacement package manager or software centre. Changes should
preserve keyboard-first workflows, explicit user control, and effectively zero
idle overhead.

## Development setup

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

Use `npm run dev` with Vicinae running for interactive development.

The primary development target is Ubuntu with its standard APT/dpkg and Polkit
setup. Flatpak and local AppImage features are optional. Before submitting a
change, test with unavailable optional tools as well as the normal installed
configuration.

## Source layout

- `src/backends/` contains APT, Flatpak, AppStream, and desktop-entry adapters.
- `src/local-packages/` inspects and installs explicitly selected local files.
- `src/hooks/` owns demand-driven command state and cancellation.
- `src/components/` contains reusable native Vicinae views.
- `src/utils/` contains small shared primitives without backend policy.
- `src/linux.ts` defines trusted Linux executable and user-data paths.
- `tests/` covers parsing, ranking, validation, transactions, and security edges.

Keep policy in its owning backend or feature. Avoid speculative interfaces,
large custom catalogues, persistent workers, and abstractions used by only one
simple call site.

## System integration

APT repository installs, removals, and cache refreshes use the
distribution-provided aptdaemon D-Bus API when available and retain a direct
`pkexec` compatibility path. APT upgrades and local `.deb` files use the guarded
direct path because aptdaemon 2.0.2 can orphan simulated upgrade transactions
and rejects extension-staged files. Simulations must use the same arguments as
the authenticated command (`aptSimulationArgs`), and safety-relevant
simulations must reject truncated output (`requireCompleteOutput`).

Compare package identities in APT's form. dpkg prints native Multi-Arch
packages with an architecture qualifier (`libfoo:amd64`) that APT omits; use
the backend's normalization instead of comparing raw dpkg output. Test parsers
with output captured from real tools, not invented fixtures.

Report operation failures through `reportOperationFailure` in
`src/utils/operation-feedback.ts` so cancellations stay silent, technical
details reach the user, and failures are recorded in Recent Actions. Flatpak operations use its CLI with an explicit user or system
scope. Local AppStream data enriches results but is never required for basic
package-manager output.

Installed applications are launched through package-manager desktop entries
using the fixed `gio` executable. Depot does not guess application executables
or build commands from package metadata.

Local AppImages are inspected without execution, copied into `~/Applications`,
and integrated through user-level desktop files. Files managed by Depot are
recorded so future removal can target only known paths.

Installed AppImage discovery is a bounded, non-recursive scan of direct regular
files in `~/Applications`. Content validation determines whether a file is an
AppImage; extensions are not trusted. External AppImages remain distinguishable
from Depot-owned integrations, and their removal must remain file-only.

Package bundles are declared and validated in `src/package-bundles.ts` and
presented by `src/bundles.tsx` without adding bundle concerns to Depot Install.
Resolution is demand-driven when a bundle is opened; installation batches APT
once and keeps Flatpak independent by scope and remote. Bundles contain package
IDs only and must not gain scripts, hooks, or repository-management behavior.

Software profile parsing and serialization live in `src/software-profiles.ts`.
The format is deliberately strict and versioned. Import code must keep profiles
as inert data, reject unknown executable behavior, preserve backend identifiers,
and require review before package installation. AppImage records must remain
honest about whether they can be restored automatically.

APT removals require two conservative checks: a read-only preview used for user
feedback and transaction-time validation used for authorization. Never reuse a
preview as proof that later package state is still safe. Update actions must
keep package-manager backends independent rather than constructing a combined
shell pipeline.

All external programs must receive explicit argument arrays with shell
execution disabled. Do not interpolate package IDs, paths, metadata, or URLs
into command strings. See [SECURITY.md](SECURITY.md) before changing subprocess,
authentication, local-file, or removal behavior.

## Performance rules

- Do not add daemons, timers, scheduled tasks, or idle polling.
- Query backends only when the relevant command is opened or an action is run.
- Keep search bounded, debounced, cancellable, and independent by backend.
- Use operating-system metadata instead of building a private package index.
- Inspect only deliberately managed AppImage locations; never crawl the home
  directory or mounted filesystems.
- Introduce persistent caching only for a measured need, with documented size,
  expiry, and invalidation.

## Testing changes

Every change must pass the commands in Development setup. Add focused tests for
new parsing, validation, ranking, and failure behavior. Package operations also
need manual checks appropriate to their risk, including authentication
cancellation, unavailable network, package-manager lock contention, and paths
containing spaces or shell metacharacters.

Before submitting package-operation changes:

1. Inspect every new subprocess invocation.
2. Confirm no shell interpolation is used.
3. Verify failure cleanup leaves no partial managed files.
4. Confirm closing the command leaves no unnecessary process running.
5. Review the diff for generated files, debug output, and unrelated changes.

## Adding another backend

A backend should be added only with a real, tested implementation and a clear
security model. Do not force unlike systems into identical behavior: repository
package managers and portable AppImage file management have different
capabilities.

Proposals should document source trust, identifier validation, privilege
requirements, installation/removal semantics, cancellation safety, performance,
and tests. AUR support requires a separate design review because PKGBUILDs can
execute packaging code; it must not be exposed as an ordinary binary-package
install source.
