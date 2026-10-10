# Changelog

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
