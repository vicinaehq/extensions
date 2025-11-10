# SuperGenPass Extension

Generate deterministic passwords using the SuperGenPass algorithm. Create unique, strong passwords for websites based on a master password and domain.

## Features

- Generate passwords using the official SuperGenPass algorithm
- Support for MD5 and SHA-512 hashing methods
- Configurable password length (4-24 characters)
- Automatic subdomain removal for consistent passwords
- Optional secret password for additional security
- Copy generated passwords to clipboard

## How it works

SuperGenPass creates unique passwords for each website by hashing your master password combined with the website's domain. This means:

- Same master password + same domain = same generated password
- Different domains get different passwords
- No passwords are stored - they're generated on-demand

## Setup

1. Install the extension
2. Set your master password in the extension preferences
3. Configure other options as needed (length, hash method, etc.)

## Usage

1. Open the SuperGenPass command
2. Enter a domain name (e.g., `example.com`) or full URL
3. Click "Generate Password"
4. Copy the generated password to use on the website

## Security Notes

- Keep your master password secure and memorable
- The generated passwords are deterministic - if you forget one, you can regenerate it
- Never share your master password
- Consider using a secret password for additional security layers

## Algorithm Details

The SuperGenPass algorithm:
1. Combines master password + optional secret + ":" + domain
2. Hashes the result using MD5 (default) or SHA-512
3. Ensures the final password meets complexity requirements (starts with lowercase, contains uppercase and numbers)
4. Returns the first N characters as specified

## Credits

SuperGenPass algorithm by [Chris Zarate](https://supergenpass.com/)

This extension is not affiliated with the original SuperGenPass project.

## License

MIT