# Systemd Services Extension

A Vicinae extension for managing systemd services on Linux systems.

## Features

- **Service Management**: Start, stop, restart, and reload systemd services
- **Boot Configuration**: Enable/disable services to start at boot
- **Service Monitoring**: View service status, load state, and sub-status
- **Log Viewing**: Access service logs for the current boot session
- **Filtering**: Filter by service type (system/user) and status (running/stopped)
- **Search**: Search through services by name or description
- **Visual Indicators**: Color-coded status icons and service type accessories
- **Detailed Information**: Process ID, start time, CPU usage, I/O statistics, and control groups
- **D-Bus Integration**: Direct communication with systemd for service data

## Requirements

- Linux system with systemd
- D-Bus access

## Usage

### Basic Navigation

1. Open the extension to see all available systemd services
2. Use the dropdown filter to show:
   - **All Services**: Both system and user services
   - **System Services**: Only system-wide services
   - **User Services**: Only user-specific services
   - **Running Services**: Currently active services
   - **Stopped Services**: Currently inactive services

### Service Actions

Select a service and use the action panel:

- **Start**: Start a stopped service
- **Stop**: Stop a running service
- **Restart**: Restart a running service
- **Reload**: Reload service configuration without full restart
- **Enable**: Enable service to start at boot
- **Disable**: Disable service from starting at boot

### Viewing Details

- **Show Details**: View comprehensive service metadata and recent logs
- **Refresh**: Update the service list and status

### Service Information Displayed

The detail view shows:

- **Basic Info**: Name, description, status, sub-status, load state
- **Process Info**: Process ID, start timestamp
- **Performance**: CPU usage time, I/O read/write statistics
- **System Info**: Control group, current job, following relationships

### Service Status Indicators

- **Green**: Active
- **Red**: Failed
- **Gray**: Inactive
- **Orange**: Unknown status

### Log Viewing

Service logs are displayed in the detail view with:

- Clean formatting (timestamps and process prefixes removed)
- Current boot session only
- Automatic loading when viewing details

## Keyboard Shortcuts

| Action       | Shortcut   |
| ------------ | ---------- |
| Start/Stop   | Ctrl+S     |
| Restart      | Ctrl+R     |
| Reload       | Ctrl+L     |
| Enable       | Ctrl+E     |
| Disable      | Ctrl+D     |

## Troubleshooting

### No Services Found

- Verify systemd is running
- Check D-Bus permissions
- Try refreshing the service list

### Permission Errors

- Some system services require root privileges
- User services should work with standard user permissions

### Log Loading Issues

- Logs are limited to the current boot session
- Some services may not have recent logs
- Check journalctl permissions

### D-Bus Connection Issues

- Ensure D-Bus daemon is running
- Check if the extension can access system and session buses

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Dependencies

- `@vicinae/api`: Vicinae extension API
- `dbus-next`: D-Bus communication library
