# LACT Profiles for Vicinae

Browse the profiles exposed by the [LACT](https://github.com/ilya-zlobintsev/LACT) CLI, see which one is active, and switch profiles from Vicinae. The extension also shows LACT's automatic profile-switching status and lets you enable or disable it.

The extension icon is the official LACT application icon from `res/io.github.ilya_zlobintsev.LACT.png`, used under the LACT project's MIT licence; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Requirements

- Linux and Vicinae
- LACT v0.8.2 or later, with `lact` available on `PATH` ([releases](https://github.com/ilya-zlobintsev/LACT/releases))
- The LACT daemon (`lactd`) running and accessible to the desktop user

Selecting a profile through LACT's CLI disables automatic switching. Turning automatic switching off follows LACT's behaviour and selects `Default`. If enabling automatic switching has already moved the active profile to `Default` (for example, when no rule matches), disabling it leaves `Default` active; the extension does not restore the profile that was active before automatic switching was enabled.

The extension runs as the logged-in user and does not invoke `sudo`. Follow LACT's installation and socket-permissions documentation if the CLI cannot reach the daemon.

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
```
