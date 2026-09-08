## [1.1.0] - 2026-03-24

### Added

- Support for KeePassXC installed via Flatpak, Snap, and AppImage — the CLI path and arguments are now auto-detected based on the installation type
- Keyboard shortcut `Ctrl+C` for the Copy Password action
- README: installation instructions for Flatpak, Snap, and AppImage

### Fixed

- `cacheCredentials` and `deleteCredentialsCache` are now properly awaited (`LocalStorage` calls were fire-and-forget)
- `showToastCliErrors` now correctly returns `Promise<void>` instead of `void`
- `errorHandler` in `SearchDatabase` is now async so toast errors are awaited
- Replaced `ImageLike` type alias import with inline `Image.ImageLike` to fix a TypeScript error
- Fixed `subtitle` prop type on `List.Item` to match the current API
- Fixed a typo: `chuncks` → `chunks`

## [1.0.0] - 2026-02-03

### Added

- Initial release.
