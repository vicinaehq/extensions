# Updates

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
