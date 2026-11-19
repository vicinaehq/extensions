# Updates and removal

## Update review

**Depot Update** queries APT and Flatpak only when the command opens. Available
updates are grouped by source and show current and available versions whenever
the package manager provides them.

The first row applies every visible update. The action menu also offers
**Update APT** and **Update Flatpak**, and each application can still be updated
individually. Every bulk action shows the affected applications before asking
for confirmation. APT and Flatpak always run as independent transactions with
their own authentication and failure handling.

APT updates follow Ubuntu's own upgrade policy. Packages held with
`apt-mark hold` and updates Ubuntu is still phasing in are not listed or
installed, so Depot never installs what `apt-get upgrade` would deliberately
hold back. If another package operation is already running, Depot says so
instead of silently ignoring the action.

Depot does not invent progress percentages. The transaction message follows
backend phases such as resolving, downloading, and applying when they are
available.

AppImages are omitted from update counts unless Depot can determine updates
from supported, trustworthy update metadata. Filename matching and web searches
are not update mechanisms.

## Removal review

APT applications shown by Depot must own a visible desktop entry and must not
be marked Essential or assigned required/important priority. Selecting Remove
runs `apt-get --simulate --no-auto-remove remove` with the exact package ID.

If APT reports that other installed packages would also be removed, Depot names
those packages and refuses the operation. If the preview is safe, the normal
confirmation states that no other installed packages are planned for removal.

The real transaction repeats its own simulation. This second check is
intentional: package state can change between preview and authentication. Depot
never removes lock files, runs autoremove, or edits APT's package database.

Flatpak and AppImage removal retain their existing source-specific safety:
Flatpak removes the selected application through Flatpak, while AppImage
removal targets only the selected file and exact Depot-owned integration files.
