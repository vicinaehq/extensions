# Himalaya Mail Extension

A Vicinae extension for viewing and managing emails using Himalaya.

## Features

- List emails from your configured mailbox
- View full email content
- Delete emails
- Configurable email folder (INBOX, Sent, etc.)

## Requirements

- [Himalaya](https://github.com/pimalaya/himalaya) email client installed and configured
- Vicinae launcher

## Installation

1. Install Himalaya:
   ```bash
   # Using cargo (recommended)
   cargo install himalaya

   # Or using nix
   nix-env -iA nixpkgs.himalaya

   # Or download from releases
   ```

2. Configure Himalaya with your email account (see Himalaya documentation)

3. The extension will be available in Vicinae after building

## Configuration

Set the email folder in the extension preferences (default: INBOX).

## Usage

- Search for "List Emails" in Vicinae
- View emails, read content, and delete as needed