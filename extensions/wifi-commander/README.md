# Wi‑Fi Commander

A comprehensive Wi‑Fi management extension for Vicinae that provides complete control over wireless networks using `nmcli` or `iwctl`.

## Features

### Core Actions
- **Turn Wi‑Fi On/Off**: Quick toggles for Wi‑Fi radio
- **Restart Wi‑Fi**: Restart Wi‑Fi services to resolve connection issues
- **Disconnect**: Disconnect from current network

### Network Scanning
- **Scan Available Networks**: Discover all nearby Wi‑Fi networks
- **Smart Connection**: Automatically detects saved networks and connects without password prompt
- **Hidden Connection**: Gives to option to connect to hidden Networks [just `iwclt`]
- **Password Protection**: Secure password form for new networks
- **Signal Strength**: Visual indicators for network quality
- **Security Info**: Display security type (WPA2, WEP, etc.)

### Saved Network Management
- **View Saved Networks**: List all previously connected networks
- **Smart Actions**: Primary action adapts based on network availability
  - **Disconnect**: When network is currently available
  - **Connect**: When network is currently available
  - **Forget**: When network is not available
  - **Toggel Auto Connection**: For every Network
- **Connection Status**: Visual indicators for connected networks
- **Quick Access**: Connect to saved networks without scanning

### Advanced Features
- **Real-time Updates**: Automatic refresh of network status
- **Copy Actions**: Copy SSID, BSSID, or UUID to clipboard
- **Detailed Information**: Comprehensive network details in metadata view
- **Keyboard Shortcuts**: Efficient navigation with keyboard shortcuts

## Commands

| Command                 | Description                        | Mode    |
| ----------------------- | ---------------------------------- | ------- |
| `toggle-wifi-on`        | Turn Wi‑Fi radio on                | No-view |
| `toggle-wifi-off`       | Turn Wi‑Fi radio off               | No-view |
| `restart-wifi`          | Restart Wi‑Fi services             | No-view |
| `scan-wifi`             | Scan and manage available networks | View    |
| `manage-saved-networks` | Manage saved Wi‑Fi connections     | View    |

## Requirements

- Linux system with NetworkManager
- `nmcli` or `iwctl` command-line tool
- Vicinae launcher

## Installation

```bash
# Install dependencies
pnpm install

# Build the extension
pnpm build

# Run in development mode
pnpm dev
```

## Usage

### Quick Actions
- Use `Turn Wi‑Fi On/Off` for instant Wi‑Fi control
- Use `Restart Wi‑Fi` to resolve connection issues

### Network Discovery
1. Open `Scan Wifi Networks`
2. Browse available networks with signal strength
3. Connect to open networks or enter password for secured ones
4. Connected networks are automatically saved

### Managing Saved Networks
1. Open `Manage Saved Networks`
2. View all previously connected networks
3. Connect to available networks or forget unavailable ones
4. Copy network information as needed

## Keyboard Shortcuts

### Scan Networks View
- `Cmd+Enter`: Connect to selected network
- `Cmd+D`: Disconnect from current network
- `Cmd+C`: Copy SSID
- `Cmd+Shift+C`: Copy BSSID
- `Cmd+R`: Refresh network list

### Saved Networks View
- `Cmd+Enter`: Connect to selected network
- `Cmd+D`: Disconnect from current network
- `Cmd+Delete`: Forget selected network
- `Cmd+C`: Copy network name
- `Cmd+Shift+C`: Copy UUID
- `Cmd+R`: Refresh network list
- `Cmd+A`: Toggle Auto Connect [just `iwclt`]

## Technical Details

- Built with TypeScript and React
- Uses `nmcli` or `iwctl` for all network operations
- Real-time network scanning with `--rescan yes`
- Smart network detection and management
- Robust error handling and user feedback

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
