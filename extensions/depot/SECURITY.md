# Security

## Model

Depot delegates package management to APT, Flatpak, and Polkit:

- Package identifiers are validated and passed as subprocess arguments with
  shell execution disabled.
- APT keeps its normal repository signature and trust checks.
- Polkit owns privileged authentication; the extension never receives or stores
  passwords.
- Only existing APT sources and Flatpak remotes are used. Depot never adds
  repositories, remotes, signing keys, or downloaded scripts.
- Install, remove, refresh, and update operations require an explicit user
  action. There are no background services or scheduled package operations.
- APT removal is limited to visible, manually installed applications and is
  blocked when its simulation would remove additional packages.

## Reporting a vulnerability

Do not publish exploit details in a public issue. Contact the maintainer through
the GitHub account listed as the extension author (`oo7kc`) and request a private
reporting channel. Include the affected command, package source, Vicinae version,
and reproduction steps.
