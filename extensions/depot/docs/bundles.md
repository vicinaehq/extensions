# Depot package bundles

Package bundles install a small, related group of APT and Flatpak applications.
They are built into Depot and contain package identifiers only—no scripts,
hooks, repository changes, or post-install commands.

## Included bundles

- **Developer Essentials** — Git, curl, and Ubuntu build tools
- **Creative Studio** — FFmpeg plus GIMP, Inkscape, and OBS Studio from the
  user's configured Flatpak remotes

Depot never adds a repository or Flatpak remote for a bundle. Missing packages
remain visible as unavailable.

## Installing a bundle

Open **Depot Install** and select a bundle from the initial list. Depot checks
every entry on demand and shows:

- **Will Install** — available packages selected for installation
- **Available · Not Selected** — available packages removed from the selection
- **Already Installed** — packages Depot will not reinstall
- **Unavailable** — packages not found in the configured sources

The first row on the review screen installs the selected packages with Enter.
APT packages are submitted as one transaction when possible. Flatpak remains an
independent transaction because it has different scope and authentication
semantics.

## One-off package lists

Choose **Install Package List** from the initial Depot Install list to paste
space- or comma-separated package IDs without creating a file. APT and Flatpak
use separate fields so Depot never guesses which source the user intended.

Package lists use the same identifier validation, availability review,
selection, confirmation, transaction feedback, and partial-failure handling as
built-in bundles. Lists are not saved after the command closes.
