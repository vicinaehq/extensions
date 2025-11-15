<p align="center">
    <img src="assets/extension_icon.png" alt="Vicinae Pass Icon" width="96" />
</p>

# Vicinae Pass

Vicinae Pass lets you browse, decrypt, and copy secrets that are saved in your GNU pass vault directly from Vicinae on Linux. It mirrors the Raycast experience while embracing the Vicinae component and toast system.

## Requirements

- [pass](https://www.passwordstore.org/) configured with your GPG key
- `gpg` available in your `$PATH`
- [`oathtool`](https://manpages.debian.org/oathtool) (optional) for generating OTP codes from `otpauth://` lines

## Commands

| Command | Description |
| --- | --- |
| `Pass` | Lists every `.gpg` entry inside your password-store directory, promotes the last used entry, and lets you copy or paste individual fields. |

## Preferences

- **Pass Store Location** – Absolute path to your `~/.password-store` directory (defaults to `~/.password-store`).
- **GPG Passphrase** – Optional passphrase that unlocks your key via GPG loopback mode.
- **Additional PATH Entries** – Colon-separated directories appended to `PATH` before running `gpg` or `oathtool`.
- **Prioritize OTP After Password** – When enabled, OTP entries jump to the top after you copy a password to speed up two-factor flows.
- **Last Used TTL (seconds)** – How long the last-used entry is pinned to the top of the list (defaults to 120 seconds).

## Usage

1. Run the `Pass` command in Vicinae.
2. Entries are sorted alphabetically; the most recent entry (within the TTL) is pinned to the top.
3. Select an entry to decrypt it. The first line becomes the `Password` option; additional `Key: Value` lines become individual fields.
4. Use the actions to copy a field to the clipboard or paste it directly into the focused window. Successful actions update the “last used” cache so follow-up operations stay nearby.
5. Lines starting with `otpauth://` trigger `oathtool` and render an `OTP` option. If `oathtool` is missing, the extension shows a toast explaining how to fix it and still lists the remaining fields.

## Development

```bash
git clone <this-repo>
cd <this-repo>
npm install
npm run dev
```

Use `npm run build` to assemble a production bundle that Vicinae can import.

## Troubleshooting

- Make sure your password store is initialized (`pass init ...`) and contains `.gpg` files.
- If GPG prompts for a passphrase, add it to the extension preferences or ensure your agent has the key unlocked.
- Install `oathtool` if you want OTP generation: `sudo apt install oathtool` (Debian/Ubuntu) or `sudo pacman -S oathtool` (Arch).
