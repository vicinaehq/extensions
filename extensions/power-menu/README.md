# Power Menu Extension

A comprehensive power management extension for Vicinae launcher, providing essential system control commands at your fingertips.

## Features

### Core Power Commands
- **Power Off** - Shutdown the system immediately
- **Reboot** - Restart the system immediately  
- **Suspend** - Put system to sleep (RAM)
- **Hibernate** - Save state to disk and power off
- **Logout** - End current user session
- **Lock Screen** - Secure your session with password

### Advanced Commands
- **Reboot to UEFI** - Restart directly to firmware setup
- **Reboot to Recovery** - Restart to system recovery mode

## Installation

1. Build the extension:
   ```bash
   pnpm build
   ```

2. The extension will be automatically installed to your Vicinae extensions directory.

## Usage

Simply type the command name in Vicinae launcher:
- `poweroff` - Shutdown system
- `reboot` - Restart system
- `suspend` - Suspend to RAM
- `hibernate` - Hibernate to disk
- `logout` - Logout user
- `lock-screen` - Lock screen
- `reboot-uefi` - Reboot to UEFI
- `reboot-recovery` - Reboot to recovery

## System Requirements

- Linux system with systemd
- Appropriate permissions for power management commands
- GNOME desktop environment (for logout and lock screen commands)

## Error Handling

The extension provides graceful error handling:
- Shows clear error messages if commands fail
- No destructive fallback commands
- User-friendly feedback for all operations

## Development

Built with:
- TypeScript
- React
- Vicinae API
- Node.js child_process for system commands

## License

MIT
