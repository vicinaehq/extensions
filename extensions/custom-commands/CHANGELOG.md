# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `custom-commands` extension with `commands` view (`Custom Commands`)
- Create, edit, duplicate, delete for custom shell commands
- Terminal vs background execution (`runInTerminal` with `hold` + `workingDirectory`, `exec` with 30s timeout, output copied to clipboard)
- Dynamic placeholders `{{key}}` with `RunWithArgsForm` (one field per unique non-system key)
- System placeholders auto-resolved: `{{clipboard}}`, `{{selection}}` (fallback to clipboard), `{{home}}`, `{{user}}`, `{{date}}`, `{{time}}`, `{{datetime}}` (shell-escaped)
- Case-insensitive placeholder matching
- Custom icons via URL or local file path (`getIcon()` with `Icon.Terminal` fallback)
- Grouping: `group` field, `List.Dropdown` filter, sections per group (`Ungrouped` last), search includes group
- Import / export via clipboard JSON
- `terminal` and `defaultWorkdir` preferences

### Fixed
- `runInTerminal` now uses correct `workingDirectory` + `hold:true` (was `cwd`)
- Custom terminal pref parsed with quote-aware split, detached `spawn` with fallback to native launcher
- `closeMainWindow()` now always on success (removed `closeOnRun` preference)
- Filter: `showCreateFromSearch` for any non-empty query (was `>2` chars), duplicate `Create` rows removed
- Placeholder `{{clipboard}}` injection sanitized via single-quote escaping

### Changed
- Extension `custom-commands` / command `commands` / `Custom Commands` (was `custom-commands`/`custom-commands`)
- Placeholder system only `{{...}}` (removed legacy `$ARGS`/`{{input}}` aliases)
- Icons: built-in picker removed, only custom URL/path

### Removed
- `closeOnRun` preference (now always close)
- Legacy placeholder aliases
