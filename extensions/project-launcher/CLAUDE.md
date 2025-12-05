# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Vicinae extension that provides two main features:
1. **Code in New Folder**: Creates dated project folders and opens them in a configured editor
2. **Search Recent Projects**: Searches editor workspace history to quickly reopen recent projects

The extension supports Positron, VS Code, and Cursor editors.

## Development Commands

```bash
# Start development mode with hot reload
npm run dev

# Build for production
npm run build

# Format code with Biome
npm run format

# Lint code
npm run lint
```

## Development Workflow

**IMPORTANT**: After editing any code in this extension, you MUST:

1. **Rebuild the extension**: Run `npm run build` to compile TypeScript changes
2. **Test the extension**: Launch Vicinae and test the affected commands to ensure changes work correctly
3. **Verify functionality**: Test both "Code in New Folder" and "Search Recent Projects" if changes affect shared code

The extension must be rebuilt before Vicinae can pick up any code changes. Always rebuild and test after making modifications.

## Architecture

### Extension Structure

This is a Vicinae extension built with TypeScript and React. The extension follows Vicinae's architecture:

- `package.json`: Extension manifest defining commands, preferences, and metadata
- `src/code-in-new-folder.tsx`: Form-based command for creating new project folders
- `src/search-recent-projects.tsx`: List-based command for browsing recent projects
- `vicinae-env.d.ts`: Auto-generated TypeScript definitions from manifest

### Key Components

**Code in New Folder (`src/code-in-new-folder.tsx`)**
- React Form component with real-time path preview
- Configurable folder structure: `[BASE_PATH]/[YEAR]/[MM-DD]/[TITLE]`
- Path processing utilities:
  - `expandPath()`: Handles ~, absolute, and relative paths
  - `processTitle()`: Sanitizes and truncates folder names
  - `validateProgramName()`: Prevents shell injection in editor commands
  - `validateBasePath()`: Checks directory writability before creation
- Supports override base path for one-off folder locations
- Security: Uses proper shell escaping for all paths and commands

**Search Recent Projects (`src/search-recent-projects.tsx`)**
- React List component displaying recent workspaces
- Reads workspace history from editor config directories:
  - `~/.config/Positron/User/workspaceStorage/*/workspace.json`
  - `~/.config/Code/User/workspaceStorage/*/workspace.json`
  - `~/.config/Cursor/User/workspaceStorage/*/workspace.json`
- Extracts git branch info using `git rev-parse --abbrev-ref HEAD`
- Color-codes branches by type (main/blue, feature/green, fix/red, etc.)
- Sorts by last modified time, limits to 50 most recent projects

### Configuration System

Preferences are defined in `package.json` and accessed via `getPreferenceValues<Preferences>()`:
- `programName`: Editor command (positron/code/cursor)
- `basePath`: Base directory for new folders
- `addYearToPath`: Include year in folder structure
- `addMonthDayToPath`: Include MM-DD in folder structure
- `sanitizePathName`: Convert titles to snake_case
- `truncatePathName`: Limit title length to 50 chars or 10 words

TypeScript types are auto-generated in `vicinae-env.d.ts` from the manifest.

## Important Implementation Details

### Path Handling
- Empty `basePath` defaults to home directory
- Tilde notation (`~/playground`) expands to home-relative paths
- Absolute paths (`/projects`) are used as-is
- Relative paths are resolved from home directory
- All paths are properly escaped when passed to shell commands

### Security Considerations
- `validateProgramName()` prevents shell injection by checking for metacharacters
- All paths passed to `execSync`/`execAsync` are wrapped in double quotes
- Editor commands are validated before execution
- No user input is directly interpolated into shell commands without validation

### Error Handling
- Base path validation checks writability before folder creation
- Editor command execution provides specific error messages for "not found" vs "permission denied"
- Workspace parsing gracefully handles malformed JSON files
- Git branch detection uses try-catch with timeouts to prevent hanging

### Workspace Storage Format
Editor workspaces are stored as:
- `workspace.json`: Contains `folder` URI (e.g., `file:///home/user/project`)
- `state.vscdb`: SQLite database with modification time used for sorting
- Paths are URI-encoded and must be decoded with `decodeURIComponent()`
