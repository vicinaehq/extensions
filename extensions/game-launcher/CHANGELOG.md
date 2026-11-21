# Changelog

All notable changes to this extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1] - 2026-11-17

### Changed

- Hide Game / Unhide Game moved from Ctrl+H to Ctrl+Shift+H, and Show in Steam Library no longer has a shortcut, so
  Ctrl+H and Ctrl+L move left and right in the grid again
  ([vicinaehq/extensions#460](https://github.com/vicinaehq/extensions/issues/460)).
- Open Store Page no longer has a shortcut (it was Ctrl+S).
- Launch with *other launcher* is now Shift+Enter, the key the action panel shows for it, instead of Ctrl+Enter. Show in Steam Library moved
  to the Steam section and Open Install Folder to the last section, so Shift+Enter only ever launches the game.

## [1.0.0] - 2026-11-16

### Added

- Search and launch installed games from Steam, Lutris and Heroic (native or Flatpak, and Steam as a Snap), most
  recently played first, as an artwork grid or a list.
- Match on titles, acronyms, Steam App IDs and Lutris slugs.
- Show a game installed through several launchers once, with a launcher priority setting and "Launch with …" actions
  for the others.
- Reuse each launcher's favourites, hidden games, collections and categories in the filter dropdown.
- Optionally download high-resolution covers, banners and icons for Steam and Heroic games, cached on disk.
- Leave out Proton, the Steam Linux Runtime and other Steam tools, and the store clients Lutris installs; both can be
  shown in Settings.

[Unreleased]: https://github.com/DavidSeptimus/game-launcher-vicinae-extension/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/DavidSeptimus/game-launcher-vicinae-extension/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/DavidSeptimus/game-launcher-vicinae-extension/releases/tag/v1.0.0
