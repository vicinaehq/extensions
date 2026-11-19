# Changelog

## Unreleased

Initial release of Depot, a keyboard-first Linux software manager for Vicinae.

- **Depot Update** groups available APT and Flatpak updates by source and
  applies one item, one source, or all sources after confirmation. Held and
  phased APT updates are excluded.
- **Depot Clean** previews unused APT packages, obsolete APT archives, and
  unused Flatpak runtimes, then purges exactly the reviewed APT packages and
  removes only the reviewed Flatpak runtime refs after revalidation.
- Flatpak is optional; Depot remains fully usable with APT alone.
- Recent Actions keeps a small local history of completed and failed
  operations, including bounded diagnostic details for failures.
