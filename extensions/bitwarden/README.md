<div align="center">
  <img src="https://raw.githubusercontent.com/edmogeor/vicinae-bitwarden/master/assets/extension_icon.png" width="140" alt="Bitwarden for Vicinae Logo"/>
  <h1>Bitwarden for Vicinae</h1>
  <p>
    <a href="https://github.com/edmogeor/vicinae-bitwarden/actions/workflows/ci.yml">
      <img src="https://github.com/edmogeor/vicinae-bitwarden/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI"/>
    </a>
    <a href="https://github.com/edmogeor/vicinae-bitwarden/releases">
      <img src="https://img.shields.io/github/v/release/edmogeor/vicinae-bitwarden" alt="version"/>
    </a>
    <a href="https://github.com/fallow-rs/fallow">
      <img src="https://raw.githubusercontent.com/edmogeor/vicinae-bitwarden/badges/badge.svg" alt="fallow health"/>
    </a>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"/>
    </a>
  </p>
</div>

Keyboard-driven access to your Bitwarden vault — right from the Vicinae launcher. Unlock once with your master password, then search for any item, copy credentials, grab a TOTP code, or create new entries, all without leaving the keyboard.

## Prerequisites

- **[Bitwarden CLI](https://bitwarden.com/download/)** (`bw`) must be installed and on your PATH.
- **`libsecret-tools`** is needed for secure session storage in your system keyring:
  - **Debian / Ubuntu**: `sudo apt install libsecret-tools`
  - **Fedora**: `sudo dnf install libsecret`
  - **Arch**: `sudo pacman -S libsecret`

## Installation

Install from the Vicinae Extensions Store (Pending), or build from source:

```bash
git clone https://github.com/edmogeor/vicinae-bitwarden.git
cd vicinae-bitwarden
npm install
npm run build
```

## Configuration

Set these preferences in the extension settings before you start. Generate your API key from the Bitwarden web vault under **Settings → Security → View API key**.

### Connection

| Preference            | Type      | Description                                                                    |
| --------------------- | --------- | ------------------------------------------------------------------------------ |
| Server Region         | dropdown  | `bitwarden.com` (US), `bitwarden.eu` (EU), or `Self-hosted`                    |
| Custom Server URL     | textfield | Required when Server Region is `Self-hosted`. e.g. `https://vault.example.com` |
| Custom CA Certificate | file      | Path to a custom CA cert bundle for self-hosted servers with a private CA      |
| API Client ID         | textfield | Your personal API key `client_id`                                              |
| API Client Secret     | textfield | Your personal API key `client_secret`                                          |

### Security

| Preference        | Type     | Description                                                                                               |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| Auto-Lock Timeout | dropdown | Lock the vault after inactivity. Options: Never, 15 min, 30 min, 1 h, 2 h, 6 h, 12 h, 24 h (default: 6 h) |

### File Attachments

| Preference         | Type      | Description                                                               |
| ------------------ | --------- | ------------------------------------------------------------------------- |
| Download Directory | textfield | Where attached files are saved. Defaults to `~/Downloads` when left empty |

### Password Generation

| Preference        | Type      | Description                                              |
| ----------------- | --------- | -------------------------------------------------------- |
| Password Length   | textfield | Characters per generated password (default: `20`)        |
| Include Uppercase | checkbox  | Include A–Z (default: on)                                |
| Include Lowercase | checkbox  | Include a–z (default: on)                                |
| Include Numbers   | checkbox  | Include 0–9 (default: on)                                |
| Include Symbols   | checkbox  | Include special characters like `!@#$%^&*` (default: on) |

## Commands

### Search Vault

Filter your vault by name (case-insensitive). Items are grouped by Folder so you can browse at a glance.

**Item actions** available from the list:

| Item type   | Quick actions                                             |
| ----------- | --------------------------------------------------------- |
| Login       | Copy password, username, TOTP code; open URL; view detail |
| Card        | Copy number, security code; view detail                   |
| Identity    | Copy name, email, phone; view detail                      |
| Secure Note | View note text                                            |

**Detail view** shows every field for the item, plus:

- A TOTP countdown timer with a live verification code that refreshes every 30 seconds.
- Per-field copy and show/hide toggles for each custom field.
- File attachments — download them directly from the detail view.

A **Sync Now** action pulls the latest vault state from the server.

### Search TOTP Codes

Browse every account that has TOTP two-factor authentication set up. Live verification codes are displayed next to each item with a 30-second countdown timer. Press a key to copy the code — no need to open the item first.

### Create Item

Add a new Login, Card, Identity, or Secure Note to your vault. The form adapts its fields to the item type you pick. You can also:

- Attach files to any item you create or edit.
- Add custom fields of type Text, Hidden, or Boolean.

### Log Out

Clears your API key session and removes the cached token, TOTP secrets, and Send encryption keys from the system keyring. The next command invocation will prompt you for your master password.

> **Before uninstalling, run Log Out.** Uninstalling the extension does not by itself wipe the libsecret entries this extension creates (session, TOTP secrets, Send keys). Running Log Out first clears them; otherwise they remain in your keyring until manually removed via `secret-tool clear service vicinae-bitwarden ...`.

### Generate Password

Creates a random password using your configured settings (length, character sets) and copies it straight to your clipboard. No vault access needed.

### Search Sends

List and search your Sends — text or file shares. Filter by name (case-insensitive). Each Send shows its type and countdowns for deletion and expiration. **Actions**: Copy Send Link, Copy Text (text Sends only), View Details, Edit, Delete. A Sync action pulls the latest from the server.

### Create Send

Create a new Text or File Send. Set a name, content, optional password, deletion and expiration dates, max access count, and privacy options. The Send link is copied to your clipboard on creation.

### Receive Send from Clipboard

Reads a Send URL from your clipboard and receives it — no vault session required. Text Sends are copied to your clipboard; File Sends download to your configured Download Directory. Password-protected Sends are surfaced with clear guidance.

## Session Caching

Once unlocked, your session token is stored securely in the system keyring via `secret-tool`. Future command invocations show your vault immediately — no need to re-enter your master password until the token expires.

If you enabled **Auto-Lock Timeout**, the vault locks itself after the chosen period of inactivity so your data is never left exposed.

## License

[MIT](./LICENSE)
