# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-05-14

### Added

- Fatal startup errors now surface through a dedicated `VaultError` screen with redacted logging, instead of leaving the user with a blank list.

### Fixed

- Attachment downloads reject path-traversal in filenames returned by the CLI; broadened error logging around the download path.

### Changed

- Simplified `friendlyMessage` helper; `.claude/` is now gitignored.

## [0.4.0] - 2026-05-13

### Added

- Local TOTP computation via `otpauth` — codes are now generated in-process from secrets stored encrypted in libsecret (account `totp-secrets`). The list, item detail view, and Copy actions all share the same path. Per-item countdown uses the secret's actual period (handles 60s codes etc.).
- Steam guard secrets (`steam://`) keep using `bw get totp` as a fallback; unparseable secrets do the same and are drained through a 5-worker pool to avoid spawning a subprocess per item on first launch.
- Log Out now wipes `totp-secrets` and the pre-existing `sends-keys` keyring entries alongside the session.
- Credential rotation detected at login clears the previous account's keyring entries and local caches before swapping the session, so an account switch doesn't leak TOTP secrets or Send keys across accounts.
- README documents the keyring cleanup behaviour and notes that Log Out should be run before uninstalling the extension to wipe libsecret entries.

### Changed

- TOTP search no longer shells out to `bw get totp` for the common case; once the first sync has populated the keyring, subsequent launches render every code inline with no subprocesses.
- Detail view TOTP refresh interval is keyed to the secret's period instead of a fixed 30s.

### Tested

- New unit suites for `totp-compute`, `use-totp-secrets`, `vault-cache` totp/send key helpers, `EditSend`, and `SendDetailView`; expanded coverage of `useVaultSearch.handleCopyTotp`, `useVaultSync` (totp persistence), and `useSession` (rotation clears). Suite now at 317 tests.

## [0.3.4] - 2026-05-13

### Added

- Send detail view shows the password (masked by default, with a Show/Hide Password action); masked length matches the actual password length
- Show/Hide Password action and TextField/PasswordField swap on Create Send and Edit Send, matching the items pattern
- Receive Send now prompts for a password in-app when the Send is password-protected, instead of failing with an instruction to use the CLI
- Required-field indicators: `*` suffix on required form titles and required preference titles, plus inline `error` validation on submit for item/send name and send text/file

### Changed

- Send list now shows a text preview even for "hidden text" Sends (they're the user's own Sends)
- Edit Send password field pre-fills from the list payload when `bw send get` returns null

## [0.3.3] - 2026-05-13

### Changed

- Create Send now uses a file picker for File-type sends; the chosen path is uploaded via `bw send create --file` and the file name is derived from the basename

## [0.3.2] - 2026-05-13

### Fixed

- Edit Send view not loading due to missing default export — `search-sends.tsx` expected a default export from `edit-send.tsx` that wasn't declared

### Changed

- Removed unused exports and stale fallow suppressions across test and utility files

## [0.3.1] - 2026-05-13

### Fixed

- Send URLs were missing the encryption key segment, making shared links unusable — `accessId/key` now correctly included
- File sends now download to the configured Downloads directory instead of the process working directory
- File browser opens to the downloaded file's location for both sends and attachments
- Attachment downloads now use Vicinae's `showInFileBrowser` instead of a raw `xdg-open` call
- Friendly error toasts for send receive failures: not found, access limit reached, expired, and password-protected
- Deprecation warning lines (`trace-deprecation`) now filtered from error messages alongside existing `[DEP0]` and `DeprecationWarning` filters

### Changed

- "Receive Send" command renamed to "Receive Send from Clipboard" for clarity
- Success toasts replace HUD notifications for text copy and file download; window stays open after receiving
- Text content no longer shown in the success toast when copying received text

### Performance

- Send list loads cached data instantly on mount, no longer blocked by CLI gate checks or network sync
- Send encryption keys fetched from OS keychain only on copy, not during list display

## [0.3.0] - 2026-05-13

### Added

- Bitwarden Send support — search, create, and receive Sends directly from the launcher
- Search Sends command (view) — browse your Sends and copy links or text with a keystroke
- Create Send command (view) — create new Sends to share text or files securely from the launcher
- Receive Send command (no-view) — receive a Send from a URL in your clipboard, copying text or downloading files
- Send editing, expiration date controls, and deletion from the Send detail view
- Send access IDs are now encrypted before storage for security

## [0.2.0] - 2026-05-11

### Added

- Search TOTP Codes command — browse accounts with TOTP 2FA enabled, view live verification codes with 30-second countdown timers, and copy codes with a keystroke
- TOTP countdown progress bar on the item detail view showing remaining code validity
- File attachment support — upload files when creating or editing items; download attachments to a configurable directory (new Download Directory preference)
- Per-field copy and show/hide actions for custom fields in the item detail view
- Auto-Lock Timeout preference — automatically lock the vault after a configurable period of inactivity (15 min to 24 h, or Never)

### Fixed

- Detail view actions now disabled during loading, preventing a stuck-loader bug when no session is active; shows a Loading indicator with only the Back action available
- Security hardening — master password passed via environment variable instead of command-line arguments; sensitive payloads written through stdin; API credentials stored in system keyring
- API credentials cleared from disk after every login, while the libsecret-stored session is preserved on logout
- FilePicker control added to the edit form for selecting file attachments
- Custom fields no longer duplicated in the markdown body — rendered only in the metadata sidebar

### Changed

- Custom field actions now appear before Open URL in the action panel

## [0.1.3] - 2026-05-06

### Added

- Themed placeholder icons for each item type — white symbol on a coloured rounded rectangle matching Vicinae's native icon style (Login=Blue, Card=Green, Identity=Orange, SecureNote=Purple), with light/dark mode support
- iOS-style rounded favicon corners, pre-rendered into the PNG bytes at fetch time

### Fixed

- Favicons are now stored on disk (`supportPath/favicons/`) with a 7-day TTL, surviving extension restarts with correct timestamps
- Concurrent favicon fetches capped at 8 to prevent Google's favicon service timing out on large vaults
- Search bar now disabled during gate states (loading, unlock, login) to prevent crashes when the List unmounts
- Race condition removed: favicons are no longer cleared on Sync, so stale entries drop out when the vault item is deleted rather than on every refresh
- Login favicon fallback now uses the themed Login placeholder icon instead of a bare key string

### Changed

- Favicons cached as base64 data URIs for direct rendering instead of file paths that required a separate disk read
- Favicon cache prunes entries for domains no longer in the vault on each Sync

## [0.1.2] - 2026-05-06

### Added

- Custom CA certificate path preference for self-hosted servers using a private CA — sets `NODE_EXTRA_CA_CERTS` in the `bw` process environment

### Fixed

- Favicon cache now persists timestamps so the 24-hour TTL survives extension restarts; previously all entries were reset to `Date.now()` on every module init
- Favicon resolution handles bare domain URIs (e.g. `example.com` without a protocol) and tries all item URIs, not just the first one
- Login failures are now surfaced as a dedicated error screen with a Retry button, instead of showing the Unlock form
- Logout no longer throws when the CLI is already logged out — handles the "not logged in" response gracefully

### Changed

- Startup time reduced by running CLI checks (`bw status`, `secret-tool`, `bw --version`) in parallel via `Promise.allSettled`
- Cached vault favicons and item list load synchronously on mount for instant display; sync runs in the background
- `getErrorMessage` now filters Node.js deprecation warnings from `bw` stderr output
- Logout now clears the cached vault in addition to the session
- De-duplicated gate error rendering pattern into a shared `renderGate` function
- Extracted shared test mock utilities to reduce test boilerplate

## [0.1.1] - 2026-05-05

### Changed

- Session tokens are now stored in the system keyring via `libsecret-tools` instead of plaintext LocalStorage, providing encrypted at-rest storage
- Removed Lock Vault action from the vault list — Log Out achieves the same behaviour

### Added

- Generate Password command (no-view) — copies a random password to clipboard using the configured generation preferences
- Not-installed gate for `libsecret-tools` with OS-specific install instructions
- Full custom field type support — field-type dropdown (Text/Hidden/Boolean) in edit forms, show/hide toggle for hidden fields in detail view, boolean fields displayed as Yes/No

### Fixed

- Negative `secret-tool` availability check no longer caches failures, so installing the package and re-opening the command works without restarting Vicinae
- Use `secret-tool lookup` instead of unsupported `--version` flag for the install check
- Stripped sensitive fields (passwords, card numbers, TOTP seeds, notes, custom fields) from the LocalStorage vault cache; only display metadata is persisted
- Restored list-view copy actions (password, card number, security code, TOTP) that were lost after sensitive-field stripping — actions fetch fresh values from the CLI on demand and only appear when the field actually exists on the item

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
