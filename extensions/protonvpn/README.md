# ProtonVPN Vicinae Extension

A simple Vicinae extension that allows you to quickly control **ProtonVPN** directly from Vicinae commands without opening the terminal.

## Features

- Connect to ProtonVPN instantly
- Disconnect from ProtonVPN
- Toggle VPN connection state
- View current VPN connection status
- Fast command-based workflow directly inside Vicinae

## Requirements

- Vicinae installed
- ProtonVPN CLI installed and configured
- Logged in to ProtonVPN CLI (`protonvpn login`)

## Installation (Development)

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/vicinae-protonvpn-extension.git
cd vicinae-protonvpn-extension
npm install
npx vici build
````

The extension will be available inside Vicinae after building.

## Commands Included

| Command    | Description                    |
| ---------- | ------------------------------ |
| Connect    | Connect to ProtonVPN           |
| Disconnect | Disconnect VPN                 |
| Toggle     | Toggle VPN connection          |
| Status     | Show current connection status |

## Usage

Open Vicinae → search for:

ProtonVPN

Then choose the desired command (Connect, Disconnect, Toggle, Status).

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you would like to change.

## License

MIT
