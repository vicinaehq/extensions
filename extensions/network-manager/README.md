# Network Manager (Vicinae Extension)

An extension for [Vicinae](https://github.com/vicinaehq/vicinae) that provides quick access to `NetworkManager` actions via `nmcli` (inspired by `ulauncher-nm`).

## Features

- List and toggle VPN profiles (connect/disconnect).
- List nearby Wi-Fi networks with signal strength and security info.
- Connect to and disconnect from Wi-Fi networks.
- Quick settings actions:
  - enable/disable Wi-Fi,
  - enable/disable networking,
  - trigger Wi-Fi rescan.
- Usage-based sorting for VPN and Wi-Fi items (local usage cache).
- Status refresh after actions without leaving and reopening the command.

## Requirements

- Linux with `NetworkManager`.
- `nmcli` available in `$PATH`.
- Vicinae installed and running.
- Node.js 20+ and `npm` (for development/build).

## Installation

Official links:
- Vicinae main repository: https://github.com/vicinaehq/vicinae
- Vicinae extension docs (create/install/run workflow): https://docs.vicinae.com/extensions/create

### Quick install (recommended)

```bash
git clone git@github.com:asd2003ru/netmanger_plugin.git
cd netmanger_plugin
./install.sh
```

This script checks required dependencies (`nmcli`, `node`, `npm`), installs packages, and builds the extension.

### Option 1: Development mode

```bash
git clone git@github.com:asd2003ru/netmanger_plugin.git
cd netmanger_plugin
npm install
npm run dev
```

Vicinae must be running. After `npm run dev`, the command should appear in search with a `(Dev)` suffix.

### Option 2: Build the extension

```bash
git clone git@github.com:asd2003ru/netmanger_plugin.git
cd netmanger_plugin
npm install
npm run build
```

After a successful build, Vicinae places the extension in its local extensions directory (for example, `~/.local/share/vicinae/extensions/network-manager`).

## Useful Commands

```bash
npm run format   # format source files (Biome)
npm run lint     # run Vicinae lint checks
npm run build    # build production bundle
```
