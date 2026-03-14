# KeePassXC for Vicinae

Search passwords, usernames, TOTP codes, and more using KeePassXC directly from Vicinae.

## Features

- **Search Entries**: Quickly find passwords, usernames, URLs, and notes from your KeePassXC database
- **Copy to Clipboard**: Easily copy passwords, usernames, and URLs with keyboard shortcuts
- **Secure Unlock**: Unlock your database with password and optional key file
- **Auto-lock**: Automatically lock database after inactivity period
- **Offline Access**: All data stays local - no cloud sync required

## Requirements

- [KeePassXC](https://keepassxc.org/) installed on your system
- KeePassXC CLI tools (`keepassxc-cli`) must be available in your PATH
- Existing KeePassXC database file (.kdbx)

## Installation

1. Install this extension from the Vicinae Store
2. Configure your KeePassXC database file path in extension preferences
3. Unlock your database when prompted

## Usage

1. Open Vicinae and search for "KeePassXC"
2. Enter your search query to find entries
3. Use actions to:
   - Copy password (Cmd+C)
   - Copy username (Cmd+Shift+C)
   - Open URL (Cmd+O)
   - Copy URL (Cmd+Shift+U)
   - Edit entry (Cmd+E)
   - Lock database (Cmd+L)

## Security

- All credentials are stored securely in Vicinae's local storage
- Database is automatically locked after configured inactivity period
- No data is transmitted to external servers
- Uses KeePassXC's native CLI for all operations

## Preferences

- **Database File**: Path to your .kdbx file
- **Lock After Inactivity**: Choose timeout (Never, 1 min, 5 min, 10 min, 30 min, 60 min)

## Troubleshooting

### "KeePassXC not found" error
Ensure KeePassXC CLI tools are installed and available in your PATH:

**macOS**: `brew install keepassxc`
**Linux**: Install via your package manager (e.g., `sudo apt install keepassxc`)
**Windows**: Install KeePassXC from official website

### Invalid Credentials
- Verify your database password
- Check your key file path if using one
- Ensure the database file is not corrupted

### Database Not Found
- Verify the database file path in preferences
- Ensure the file exists and is accessible
- Check file permissions

## Development

This extension uses:
- `@vicinae/api` for Vicinae integration
- `csv-parse` for parsing KeePassXC CSV exports
- TypeScript for type safety

## License

MIT License - See [LICENSE](./LICENSE) file for details

## Support

For issues or feature requests, please open an issue on the GitHub repository.

## Credits

- KeePassXC: https://keepassxc.org/
- Vicinae: https://vicinae.com/

---

**Note**: This extension requires KeePassXC to be installed on your system. The extension only provides an interface to your existing KeePassXC database and does not store or transmit your passwords.
