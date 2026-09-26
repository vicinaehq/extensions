# Changelog

## Unreleased

- Enrich APT and Flatpak search results progressively with local AppStream names,
  descriptions, application identifiers, homepages, and cached icons.
- Rank exact application names and IDs, desktop applications, and installed
  results ahead of weaker package-description matches.
- Add transparent `vscode` and `obs` search aliases without hiding alternative
  package sources.

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
