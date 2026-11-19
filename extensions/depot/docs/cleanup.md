# System cleanup

Depot Clean removes package-manager data that the package manager itself marks
as unused. It does not guess which applications or user files are disposable.

## Review

Opening Depot Clean performs read-only previews on demand:

- APT simulates `autoremove --purge` and `autoclean`.
- Flatpak prepares `uninstall --unused` for both user and system installations,
  then Depot explicitly declines Flatpak's transaction prompt.
- AppImages are reported as unchanged because they have no shared dependency
  database or package cache.

The review lists unused APT package IDs, obsolete cached archives, and unused
Flatpak runtime IDs. If APT protects its partial-download directory from the
current user (the default on Ubuntu), Depot shows an informational note that
the preview of in-progress downloads is limited; that note is not counted as a
cleanup item, so an otherwise clean system reports Nothing to Clean. Nothing is
removed merely by opening the command.

## Cleanup

After confirmation, Depot purges exactly the reviewed unused packages with
`apt-get --no-auto-remove purge -- <ids>`. That command is simulated first and
its removal set must equal the reviewed set; if anything changed, Depot stops
and requires a fresh review. Obsolete package archives are removed with
`autoclean` only when the preview found some. Purging and archive cleanup are
separate authenticated commands, so a cleanup that needs both asks for
authentication twice.

Flatpak removes only runtimes that `flatpak uninstall --unused` identifies in
the reviewed installation scopes. APT and Flatpak remain independent, so a
failure in one source does not combine or rewrite the other's transaction.

Depot Clean never uses Flatpak's `--delete-data`, never deletes AppImages, and
never removes application configuration, cache, or personal files by guessing
their locations. It does not add repositories, run scripts, or remain active
after the command closes.
