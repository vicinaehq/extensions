# Changelog

## Unreleased

Initial release of Depot, a keyboard-first Linux software manager for Vicinae.

- **Depot Install** searches configured APT repositories and Flatpak remotes in
  one ranked list, enriched with local AppStream metadata when available. It
  also installs reviewed local `.deb`, `.flatpak`, `.flatpakref`, and AppImage
  files, package lists, built-in bundles, and software profiles.
- **Depot Manage** launches, inspects, removes, and exports installed APT,
  Flatpak, and AppImage applications.
- **Depot Update** groups available APT and Flatpak updates by source and
  applies one item, one source, or all sources after confirmation.
- **Depot Clean** previews unused APT packages, obsolete APT archives, and
  unused Flatpak runtimes, then purges exactly the reviewed APT packages and
  removes only the reviewed Flatpak runtime refs after revalidation.
- APT removals and cleanup are simulated before confirmation and validated
  again inside the authenticated transaction.
- Flatpak is optional; Depot remains fully usable as an APT-only extension.
- Recent Actions keeps a small local history of completed and failed
  operations, including bounded diagnostic details for failures.
