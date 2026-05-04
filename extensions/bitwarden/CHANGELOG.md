# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-04

Initial release.

### Added

- Search Vault command — browse items grouped by Folder, filter by name, and copy credentials (password, username, TOTP, etc.) with a keystroke
- Create Item command — add new Login, Card, Identity, or Secure Note entries to the vault
- Log Out command — clear stored Session and API key
- Unlock gate with masked master password input and Session caching via LocalStorage
- Automatic vault Sync after Unlock
- Preference-based configuration for server region (US cloud, EU cloud, or self-hosted), API key (client ID + client secret), and password generation options
- Item type-specific actions: copy password/username/TOTP/URL for Logins, copy number/code for Cards, copy name/email/phone for Identities, view notes for Secure Notes
- Item Detail view with full field inspection and show/hide password toggle
- Edit item with dynamic custom field support
- Generate password action with configurable length and character sets
- Delete item from vault list
- Create new folder from the search view
- Cached vault items and favicons for instant loading on subsequent opens
- Smoke tests for deep modules (`bw-executor`, `item-utils`, `use-session`)
- CI workflow: lint, build, test on push/PR; health badge via fallow
- Prettier formatting with pre-commit hook via husky and lint-staged
