# Network Manager Extension for Vicinae

This extension provides quick NetworkManager actions in Vicinae using `nmcli`.

- **VPN control**: Connect/disconnect configured VPN profiles.
- **Wi-Fi control**: Scan, connect, and disconnect wireless networks.
- **Quick toggles**: Enable/disable Wi-Fi and global networking.

## Usage
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the extension in development mode:
   ```bash
   npm run dev
   ```
3. Build the production bundle:
   ```bash
   npm run build
   ```

## Requirements
- Linux with `NetworkManager`
- `nmcli` available in `PATH`

## License
MIT
