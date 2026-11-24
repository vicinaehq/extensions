# OpenVPN 3 for Vicinae

Manage an OpenVPN 3 Linux profile from the Vicinae launcher. The `openvpn3` executable must be on Vicinae’s `PATH`, and your desktop must be able to open a browser for SSO profiles. Profiles that require terminal prompts are not supported.

1. **Configure**: enter an absolute file path or a `~/` path to your OpenVPN configuration. The extension stores the path locally, not the profile contents.
2. **Connect**: starts that profile and lets OpenVPN 3 open the browser if authentication is required. Complete sign-in there. The extension checks the session before reporting that it is connected.
3. **Show Status**: displays the configured VPN state followed by the full `openvpn3 sessions-list` output. Use **Refresh Status** after signing in if needed.
4. **Disconnect**: requests shutdown of the matching session only. If multiple sessions match, use the session paths shown in **Show Status** to choose one in a terminal. Disconnect before changing the configured path if you want to manage the old session from the extension.

Session matching uses the profile name reported by OpenVPN 3. Sessions started under an imported alias rather than the configured file path are shown in the raw status output but are not managed by the extension.

## Development

With Node.js 22+ and Vicinae installed:

```sh
npm ci
npm run dev     # Load in a running Vicinae instance
npm run lint   # Validate the manifest
npm test       # Test with mocked OpenVPN 3 responses
npm run build  # Build the distribution bundle
```

To smoke-test the browser flow, configure a working profile, run **Connect**, complete SSO, confirm **Show Status** reports Connected, then **Disconnect** and refresh. If another VPN profile is active, verify it is left untouched.
