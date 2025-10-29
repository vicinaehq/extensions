# Floww Vicinae Extension

A Vicinae extension for managing and applying [Floww CLI](https://github.com/dagimg-dot/floww) workflows across workspaces.

## Features

- **Workflow Discovery**: Automatically scans `~/.config/floww/workflows/` directory
- **Search & Filter**: Search workflows by name and description
- **One-Click Application**: Apply workflows with a single click
- **Multi-Format Support**: Supports YAML, JSON, and TOML workflow files
- **Error Handling**: Graceful handling of missing CLI or configuration
- **Status Feedback**: Toast notifications for success/error states
- **Workflow Validation**: Validate workflows before applying

## Prerequisites

- [Floww CLI](https://github.com/dagimg-dot/floww) must be installed
- Floww configuration must be initialized (`floww init`)

## Installation

1. Install the extension through Vicinae
2. Ensure Floww CLI is installed and configured
3. Create some workflows using `floww add`

## Actions

- **Apply Workflow**: Execute the selected workflow
- **Validate Workflow**: Check if the workflow is valid
- **Copy Workflow Name**: Copy the workflow name to clipboard
- **Show in Finder**: Open the workflow file location

## Development

```bash
# Install dependencies
pnpm install

# Build the extension
pnpm run build

# Run in development mode
pnpm run dev
```

## License

MIT