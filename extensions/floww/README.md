# Floww Vicinae Extension

A Vicinae extension for managing and applying [Floww CLI](https://github.com/dagimg-dot/floww) workflows across workspaces.

## Features

- **Workflow Discovery**: Automatically scans `~/.config/floww/workflows/` directory
- **Search & Filter**: Search workflows by name and description
- **One-Click Application**: Apply workflows with a single click
- **Multi-Format Support**: Supports YAML, JSON, and TOML workflow files
- **Remove Workflow**: Delete workflows directly from the extension
- **Workflow Validation**: Validate workflows before applying
- **Fast Loading**: Sub-10ms load times via persistent caching and parallel I/O
- **Error Handling**: Graceful handling of missing CLI or configuration
- **Status Feedback**: Toast notifications for success/error states

## Prerequisites

- [Floww CLI](https://github.com/dagimg-dot/floww) must be installed
- Floww configuration must be initialized (`floww init`)

## Installation

1. Install the extension through Vicinae
2. Ensure Floww CLI is installed and configured
3. Create some workflows using `floww add`

## Preferences

- **Floww Binary Path**: Custom path to the floww binary. Leave empty for auto-detection in `~/.local/bin/floww` or PATH.

## Actions

- **Apply Workflow** (`⌘⏎`): Execute the selected workflow
- **Validate Workflow** (`⌘V`): Check if the workflow is valid
- **Remove Workflow** (`⌘⌫`): Delete a workflow after confirmation
- **Copy Workflow Name** (`⌘C`): Copy the workflow name to clipboard
- **Show in File Browser** (`⌘F`): Reveal the workflow file in your file manager

## Development

```bash
# Install dependencies
pnpm install

# Build the extension
pnpm run build

# Run in development mode
pnpm run dev

# Lint and format
pnpm run check
```

## License

MIT