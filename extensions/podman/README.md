# Podman Containers Extension

A Vicinae extension for managing Podman containers and images on Linux and macOS, locally or on remote hosts.

## Features

- **Container Management**: Start, stop, restart, pause, and remove containers
- **Image Management**: List, pull, and remove container images
- **Container Monitoring**: View real-time container status and details
- **Log Viewing**: Access container logs with clean formatting
- **Inspection**: View detailed container and image configuration and metadata
- **Filtering**: Filter containers by status (All, Running, Stopped, Paused)
- **Search**: Search through containers and images by name or ID
- **Remote Connections**: Switch between any `podman system connection` (SSH hosts, Podman machines)
- **Visual Indicators**: Color-coded status icons and status accessories

## Requirements

- Linux or macOS system with Podman installed
- The extension looks for `podman` on `PATH` and in common install locations (`/opt/homebrew/bin`, `/usr/local/bin`, `/opt/podman/bin`, `/home/linuxbrew/.linuxbrew/bin`, `~/.local/bin`). To use a different binary, set the **Podman Binary** preference to its full path.
- Appropriate permissions to manage containers (may require sudo for some operations)

## Remote Connections

The extension can target any connection configured with Podman:

```sh
podman system connection add myserver ssh://user@host/run/user/1000/podman/podman.sock
podman system connection list
```

- Open the action panel → **Switch Connection** to pick a connection. The selection is remembered and shared between the Containers and Images commands.
- **Default Connection** runs plain `podman`, i.e. the local socket or whichever connection Podman marks as default.
- Set the **Default Connection** preference to choose which connection is used on first launch.
- System (sudo) containers are only listed when the default connection is the local socket; to manage a remote rootful instance, add a connection pointing at its root socket.

## Usage

### Basic Navigation

1. Open the extension to see all available Podman containers
2. Use the dropdown filter to show:
   - **All Containers**: All containers regardless of status
   - **Running**: Only running containers
   - **Stopped**: Only stopped/exited containers
   - **Paused**: Only paused containers

### Image Actions

Select an image and use the action panel or keyboard shortcuts:

- **Remove** (⌘X): Remove an image (will fail if containers are using it)

### Viewing Details

- **Show Details**: View image metadata and inspect data
- **Refresh** (⌘F): Update the image list

### Container Status Indicators

- **Green**: Running
- **Red**: Exited/Stopped
- **Yellow**: Created
- **Orange**: Paused or Unknown status

### Log Viewing

Container logs are displayed in the detail view with:
- Clean formatting
- Configurable number of lines (default: 50)
- Automatic loading when viewing details

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Start/Stop Container | ⌘S |
| Restart Container | ⌘R |
| Pause Container | ⌘P |
| Unpause Container | ⌘U |
| Remove Container/Image | ⌘X |
| Refresh | ⌘F |

## Permissions

Some podman operations may require elevated privileges. If you encounter permission errors:

1. Run Vicinae with appropriate permissions (e.g., via sudo)
2. Configure sudo for podman commands without password prompts
3. Check that your user has permission to manage containers

## Troubleshooting

### No Images Found
- Verify Podman is installed and running: `podman --version`
- Check if any images exist: `podman images`
- Try pulling an image: `podman pull hello-world`
- Try refreshing the image list

### Permission Errors
- Some container operations may require root privileges
- Check sudo configuration for passwordless podman access

### Image Removal Issues
- Images cannot be removed if they are being used by containers
- Stop and remove dependent containers first
- Use force removal if necessary (removes containers using the image)