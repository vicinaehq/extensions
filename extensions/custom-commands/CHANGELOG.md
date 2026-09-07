# Changelog

All notable changes to this project will be documented here.

This project uses Keep a Changelog and Semantic Versioning.

## [Unreleased]

### Added
- First version of the Custom Commands extension with a `commands` view
- Create, edit, duplicate, and delete for your own shell commands
- Run in terminal or in the background with output copied to clipboard
- Placeholders like `{{host}}` or `{{msg}}` that prompt for input when you run
- System placeholders that fill automatically: `{{clipboard}}`, `{{home}}`, `{{user}}`, `{{date}}`, `{{time}}`, `{{datetime}}`
- Case insensitive placeholder names
- Custom icons from a URL or local file path
- Groups with a dropdown filter and grouped sections
- Search by name, command, description, or group
- Import and export through clipboard JSON
- Preferences for terminal and default working directory

### Fixed
- Terminal now opens correctly with the right working directory and stays open
- Custom terminal setting is parsed correctly and falls back to the system terminal if needed
- The window now always closes after a successful run
- Search now shows the create option right away, even for short queries
- Removed duplicate create rows
- Clipboard and other system values are now passed safely to the shell

### Changed
- Extension and command names updated to `custom-commands` and `Custom Commands`
- Placeholders now use only the `{{name}}` form
- Icon picker now uses only custom URLs and file paths

### Removed
- The close window preference, it now always closes on success
- Old placeholder forms like `$ARGS` and `{{input}}`
