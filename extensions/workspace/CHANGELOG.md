# Changelog

## [1.0.0] - 2026-08-14

First release for [Vicinae](https://vicinae.com) on Linux and macOS.

### Added

- Workspace command to search and open projects from configured folders.
- List and grid views, with pinned and optional recent projects.
- Git status per project (branch, uncommitted changes, ahead/behind), plus checkout, pull, and commit log.
- Default app and per-workspace app overrides; open in terminal or the system file browser.
- Fuzzy search with fzf when installed, with substring matching as fallback.
- Onboarding, settings, and manage-workspaces commands.
- Import and export settings as a JSON backup (paste a file or folder path).

### Notes

- Pin uses `cmd+shift+p`; Pull uses `cmd+shift+u`; Refresh uses `cmd+shift+r`.
- The project list opens from cache and refreshes git status in the background.
