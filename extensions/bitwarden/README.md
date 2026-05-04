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

Keyboard-driven access to your Bitwarden vault. Search and copy passwords, usernames, and TOTP codes directly from the Vicinae launcher. Unlock once with your master password, then everything is a keystroke away.

## Prerequisites

The `bw` (Bitwarden CLI) binary must be installed and on your PATH. Download it from [bitwarden.com/download](https://bitwarden.com/download/).

## Installation

Install from the Vicinae Extensions Store (Pending), or clone and build manually:

```bash
git clone https://github.com/edmogeor/vicinae-bitwarden.git
cd vicinae-bitwarden
npm install
npm run build
```

## Configuration

Set these preferences in the extension settings before first use:

| Preference        | Type      | Description                                                                         |
| ----------------- | --------- | ----------------------------------------------------------------------------------- |
| Server Region     | dropdown  | `bitwarden.com` (US), `bitwarden.eu` (EU), or `Self-hosted`                         |
| Custom Server URL | textfield | Required only when Server Region is `Self-hosted`. e.g. `https://vault.example.com` |
| API Client ID     | textfield | Your personal API key `client_id` from the Bitwarden web vault                      |
| API Client Secret | password  | Your personal API key `client_secret` from the Bitwarden web vault                  |
| Password Length   | textfield | Number of characters for generated passwords (default: `20`)                        |
| Include Uppercase | checkbox  | Add uppercase letters to generated passwords (default: enabled)                     |
| Include Lowercase | checkbox  | Add lowercase letters to generated passwords (default: enabled)                     |
| Include Numbers   | checkbox  | Add digits to generated passwords (default: enabled)                                |
| Include Symbols   | checkbox  | Add special characters to generated passwords (default: enabled)                    |

Generate your API key from the Bitwarden web vault under **Settings → Security → View API key**.

## Commands

### Search Vault

Search all vault items by name (case-insensitive substring match). Items are grouped by Folder. Each item type exposes relevant actions:

- **Login items** — copy password, copy username, copy TOTP code, open URL, view detail
- **Card items** — copy number, copy security code, view detail
- **Identity items** — copy name, copy email, copy phone, view detail
- **Secure Note items** — view note text

A **Sync Now** action is always available to pull the latest vault state. **Lock Vault** clears the cached Session.

### Create Item

Add a new Login, Card, Identity, or Secure Note to your vault. The form adapts fields based on the selected type. `bw create` is called with the correct payload format for each type.

### Log Out

Clears the stored API key Session. The next command invocation will require re-entering your master password.

## Session Caching

After unlocking, the Session token is cached in LocalStorage. On subsequent command invocations the vault list appears immediately — no need to re-enter your master password until the Session expires (governed by your Bitwarden vault timeout settings).

## License

[MIT](./LICENSE)
