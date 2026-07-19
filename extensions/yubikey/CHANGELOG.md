# Changelog

All notable changes to this extension are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-07-14

First release. A fully native YubiKey extension, with no external dependencies.

### Added

- **YubiKey: OTP Codes** command. Lists TOTP codes with a per-account countdown ring;
  the primary action pastes the code into the focused field. Touch-required accounts
  ask for the touch before pasting. The OATH access key is read from the Secret
  Service, imported from `ykman`'s keystore when present, so no password prompt is
  needed in the common case.
- **YubiKey: Keys & Certificates** command. Enumerate and delete FIDO2 passkeys; view
  and export PIV certificates.
- Native protocol stack in pure TypeScript: PC/SC (`winscard_msg`), YKOATH, PIV,
  FIDO2/CTAP2 (CTAPHID + canonical CBOR + PIN protocol v1/v2), and a minimal D-Bus
  client for the Secret Service. No `ykman`, `yubikit`, Python or native addons.
- English and Portuguese interface, selectable via the `Language` preference
  (automatic, English or Portuguese).

### Notes

- Pasting a code purges its entry from the Vicinae clipboard history, since
  `Clipboard.paste()` has no `concealed` flag. See
  [docs/decisions.md](docs/decisions.md#clipboard-history-purge).
- PIV is read-only in this release; certificate generation and deletion (which need
  the management key) are planned for a later version.
