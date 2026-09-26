# Changelog

## Unreleased

- Enrich APT and Flatpak search results progressively with local AppStream names,
  descriptions, application identifiers, homepages, and cached icons.
- Rank exact application names and IDs, desktop applications, and installed
  results ahead of weaker package-description matches.
- Add transparent `vscode` and `obs` search aliases without hiding alternative
  package sources.
- Add a **Depot Install Local** command with automatic, content-backed
  detection and review for `.deb`, `.flatpak`, `.flatpakref`, and AppImage files.
- Install local Debian archives through APT so dependencies are resolved, and
  respect the configured Flatpak installation scope for local Flatpak files.
- Integrate AppImages at user level without executing them during inspection:
  copy to `~/Applications`, create a desktop entry, preserve a safe embedded PNG
  icon when available, avoid overwrites, record managed files, and clean up
  failed integrations.
- Make local-file selection fully keyboard-first with a focused, on-demand
  search over Vicinae's file index, avoiding the focus-losing system picker.
- Simplify shared operation errors, software identity, process diagnostics, and
  request cancellation while making authentication cancellation non-alarming.
- Strengthen TypeScript checks for unused code, missing returns, and switch
  fallthrough without adding runtime infrastructure.
- Clarify internal vocabulary with `SoftwareItem`, `DepotPreferences`, and
  `DepotOperationError` while retaining domain-level software terminology.
- Name commands consistently as Depot Install, Depot Install Local, Depot
  Remove, and Depot Update.
- Report install, integration, removal, update, and metadata-refresh results with
  one-shot desktop notifications, so completion remains visible when an external
  Polkit dialog causes Vicinae to hide.

## 1.0.0 - 2026-09-25

- Introduce Depot as a keyboard-first package manager for Vicinae.
- Search configured APT repositories and Flatpak remotes in one ranked list.
- Install software with native package-manager trust and authentication flows.
- Conservatively remove installed desktop applications.
- Review, refresh, and install APT and Flatpak updates on demand.
- Keep package metadata in a stable right-aligned column with source badges at
  the outer edge across Install, Remove, and Update.
- Add backend preferences, package details, stale-search cancellation, tests,
  release documentation, and continuous integration.
- Enforce architecture-exact APT removal safeguards, search every configured
  Flatpak scope, serialize update operations, and surface partial source errors.
