# CLAUDE.md

Guidance for Claude Code when working with this Vicinae extension.

## Project Overview

Creates dated project folders and opens them in configured editor, terminal, or file browser. Supports VS Code, Cursor, Positron, VS Codium, and custom editors (vim, emacs, etc.).

## Development Workflow

**CRITICAL**: After editing code:
1. Run `npm run build` to compile TypeScript
2. Test in Vicinae with "Code in New Folder" command

**Commands**: `npm run dev` (hot reload), `npm run build`, `npm run format`, `npm run lint`

## Architecture

**Files:**
- `package.json`: Manifest with commands and preferences
- `src/code-in-new-folder.tsx`: React Form component (modular, ~640 lines)
- `vicinae-env.d.ts`: Auto-generated types

**Code Organization:**
All functions are extracted outside the component for testability and reusability:
- Constants & Types (lines 22-95)
- Utility Functions (lines 97-183) - Pure functions
- Validation Functions (lines 185-242) - Input validation and security
- Editor Configuration (lines 244-266) - Editor-specific logic
- Path Construction (lines 268-340) - Pure path building functions
- Folder Management (lines 342-393) - Folder creation and validation
- Editor Opening Functions (lines 395-488) - Side effects isolated, return boolean success
- Form Submission Handler (lines 490-569) - Extracted for testability
- Main Component (lines 571-659) - Minimal logic, just composition

**Key Functions (all testable):**
- `expandPath()`: Pure - handles ~, absolute, and relative paths
- `processTitle()`: Pure - sanitizes/truncates folder names using method chaining
- `getDateParts()`: Pure - returns current date components for path building
- `validateProgramName()`: Pure - prevents shell injection
- `getEffectiveEditorConfig()`: Pure - returns editor command and terminal flag
- `constructFullPath()`: Pure - builds full path from preferences and options
- `constructDisplayPath()`: Pure - generates user-facing display path
- `ensureFolderExists()`: Async - validates/creates folder, shows toasts, returns boolean
- `openInEditor()`: Async - opens folder in editor, handles errors internally, returns boolean
- `openInTerminal()`: Async - opens folder in terminal, handles errors internally, returns boolean
- `openInFileBrowser()`: Async - opens folder in file browser, handles errors internally, returns boolean
- `handleFormSubmit()`: Async - unified handler for all submission modes, extracted from component

**Architecture Benefits:**
- **Testability**: All functions extracted from component, can be unit tested independently
- **Maintainability**: Clear separation of concerns, single responsibility per function
- **Error handling**: Consistent pattern - functions return boolean success or show toasts internally
- **Reusability**: Pure functions can be reused, no coupling to React component
- **Type safety**: Strong TypeScript interfaces for all data structures

**Submission Modes:**
1. Open in editor (primary) - `handleFormSubmit()` → `openInEditor()`
2. Open in terminal (secondary) - `handleFormSubmit()` → `openInTerminal()`
3. Open in file browser (tertiary) - `handleFormSubmit()` → `openInFileBrowser()`

**Preferences:**
- `programName`: Editor selection (code/cursor/positron/codium/other)
- `customEditorCommand`: Command for custom editors
- `runCustomEditorInTerminal`: Run custom editor in terminal
- `basePath`: Base directory
- `addYearToPath`, `addMonthDayToPath`: Date structure
- `sanitizePathName`, `truncatePathName`: Title processing
- `openExistingFolder`: Allow reopening existing folders
- `openSpecificFile`, `specificFileName`: Open specific file in folder

## Implementation Details

**Path Handling:**
- Empty basePath → home directory
- `~/path` → home-relative
- `/path` → absolute
- `relative` → resolved from home
- Override base path skips year/date subdirectories

**Security:**
- `validateProgramName()` prevents shell injection
- All paths double-quoted in shell commands
- No direct interpolation of user input

**Terminal/Editor Support:**
- GUI editors (code, cursor, etc.): Run via `execAsync`
- Custom editors: Optionally run in terminal via `runInTerminal`
- Terminal mode: Uses `$SHELL` or `/bin/bash`
- File browser: Uses `showInFileBrowser` API

**Error Handling:**
- Validates base path writability
- Specific errors for "not found" vs "permission denied"
- Handles existing folders based on preference
