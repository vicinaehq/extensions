# Podman Containers Extension

A Vicinae extension for managing Podman containers and images on Linux systems.

## Features

- **Container Management**: Start, stop, restart, pause, and remove containers
- **Image Management**: List, pull, and remove container images
- **Container Monitoring**: View real-time container status and details
- **Log Viewing**: Access container logs with clean formatting
- **Inspection**: View detailed container and image configuration and metadata
- **Filtering**: Filter containers by status (All, Running, Stopped, Paused)
- **Search**: Search through containers and images by name or ID
- **Visual Indicators**: Color-coded status icons and status accessories

## Requirements

- Linux system with Podman installed
- Appropriate permissions to manage containers (may require sudo for some operations)

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