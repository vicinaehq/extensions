# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open Recents command
- Preference for Aseprite path
- Optional PNG previews for `.ase` and `.aseprite` files via `aseprite --batch`
- Show Preview preference to enable or disable preview generation
- Retry Preview action when generation fails
- Auto-refresh of previews when files are modified externally (5s polling)
- Refresh Previews action (Cmd+R) to manually regenerate all previews
- Immediate success feedback when opening files (resolves on spawn, not exit)
- Session-scoped temp file cleanup on unmount
- Preview caching with stable path reuse for performance
- Fuzzy search on file name and path via List built-in filtering

### Fixed
- Preview caching now properly reuses files when source unchanged
- Duplicate loadRecentFiles effect removed
- O(n²) render optimized by using map index
- Polling effect no longer re-runs on every render (stable dependency)
- Temp cleanup only removes session's own preview files
- Stable path caching now works correctly (copies fresh preview to stable path)

### Removed
- List position badges (#1, #2, etc.) based on synthetic timestamps
- Manual debounced filtering (replaced by List built-in fuzzy search)
- useDebounce hook (no longer needed)
