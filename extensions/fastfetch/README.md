# FastFetch Extension

A Vicinae extension that displays system information using [FastFetch](https://github.com/fastfetch-cli/fastfetch).

## Features

- Display system information via FastFetch
- Copy output to clipboard
- Refresh to get updated information
- Preserves ASCII art and formatting

## Requirements

FastFetch must be installed on your system. You can install it from:
- [GitHub Releases](https://github.com/fastfetch-cli/fastfetch/releases)
- Your distribution's package manager

## Usage

1. Open Vicinae
2. Search for "FastFetch"
3. View your system information
4. Use Cmd+C to copy the output to clipboard
5. Use Cmd+R to refresh the information

## Development

```bash
# Install dependencies
bun install

# Build extension
bun run build

# Develop with hot reload
bun run dev

# Format code
bun run format

# Lint code
bun run lint
```

