# Tmux

A [Vicinae](https://github.com/vicinaehq/vicinae) extension for managing tmux sessions.

## Features

- **List tmux sessions**: View all active tmux sessions with their status
- **Attach to sessions**: Open any session in your configured terminal
- **Kill sessions**: Terminate tmux sessions with confirmation
- **Create new sessions**: Start new tmux sessions
- **Session details**: See number of windows, attachment status, and creation time

## Setup

1. **Install tmux**: Make sure tmux is installed on your system
2. **Configure terminal**: Set your preferred terminal in extension preferences (defaults to wezterm)

## Usage

1. **List Sessions**: Use the "Sessions" command to view all active tmux sessions
2. **Attach**: Select a session and choose "Attach to Session" to open it in a terminal
3. **Kill**: Select a session and choose "Kill Session" to terminate it
4. **Create**: Use "Create New Session" to start a fresh tmux session (available at any time)

## Preferences

- **Terminal Command**: Command to open your terminal emulator (defaults to 'wezterm')
- **Terminal Arguments**: Arguments passed to the terminal command (defaults to 'start --' for wezterm)

## Development

You can install the required dependencies and run your extension in development mode like so:

```bash
bun install
bun run dev
```

If you want to build the production bundle, simply run:

```bash
bun run build
```</content>
<parameter name="path">extensions/tmux/README.md