# Jujutsu Extension for Vicinae

Manage Jujutsu repositories from Vicinae with an intuitive interface that keeps your work in a single, navigable dashboard.

## Features

- **Main Dashboard**: Auto-detect your current repository or accept a `repo-path` argument and expose every JJ operation from one place
- **Navigation Glue**: A shared `launchCommand` helper plus `NavigationActions` ensure every action launches a full command component with `LaunchType.UserInitiated`, keeping state predictable across pushes
- **Reusable Action Groups**: Repository / Change / Sync / Advanced sections are shared via helper classes, so every command offers the same consistent shortcuts
- **Clipboard Feedback**: All copy actions now provide toasts to confirm success
- **Interactive Forms**: Rich forms for creating new changes and editing descriptions, complete with validation and toasts
- **Robust Error Handling**: try/catch wrappers with failure toasts keep the UI honest
- **CLI Companion**: `vjj.nu` script that mimics JJ commands and opens Vicinae deeplinks
- **JJ Integration**: Full support for bookmarks, diffs, logs, workflows, and conflict resolution

## Commands

All commands are view-mode with interconnected navigation. Below is a comprehensive list of all available commands and their actions.

### Main Dashboard (`jj main`)

The unified interface providing all JJ operations with automatic repository detection:

**Repository Status Section:**

- **Repository Status**: View full status... (Ctrl+S), View diff... (Ctrl+D)
- **Current Change**: Edit description... (Ctrl+E), New change... (Ctrl+N)
- **Recent Changes**: View log... (Ctrl+L), Time travel... (Ctrl+Shift+E)
- **Bookmarks**: Manage bookmarks... (Ctrl+B)

**Quick Actions (contextual):**

- **Describe & Commit**: Add description to current changes (Ctrl+Shift+D)
- **Push Changes**: Push all changes (Ctrl+P), Start push workflow... (Ctrl+Shift+P), Create bookmark first... (Ctrl+Shift+B)

**Repository Sync:**

- **Pull Latest Changes**: Pull from remote (Ctrl+Shift+P)
- **Push Only**: Push local changes (Ctrl+Shift+U)
- **Start Sync Workflow...**: Full sync workflow (Ctrl+Shift+S)

**Change Operations:**

- **Squash Changes...**: Squash changes (Ctrl+Shift+Q)
- **Split Change...**: Split change (Ctrl+Shift+T)
- **Abandon Change**: Abandon change (destructive, Ctrl+Delete)

**Advanced:**

- **Repository Tools**: Resolve conflicts... (Ctrl+Shift+R), Undo last operation... (Ctrl+Z)
- **Repository Info**: Copy repository path (Ctrl+C), Copy change ID (Ctrl+Shift+C)

### Status (`jj status <repo-path>`)

Shows working copy status with file-by-file breakdown:

**Per File Actions:**

- **Copy File Path**: Copy file path to clipboard (Ctrl+C)
- **Open in Terminal**: Open terminal at repository (Ctrl+T)
- **View Log...**: Navigate to log view (Ctrl+L)
- **View Diff...**: Navigate to diff view (Ctrl+D)
- **View Bookmarks...**: Navigate to bookmarks view (Ctrl+B)

**Status Indicators:**

- Modified files (orange dot)
- Added files (green dot)
- Removed files (red dot)
- Renamed files (blue dot)
- Clean working copy (green dot)

### Log (`jj log <repo-path>`)

Shows change history with navigation to change operations:

**Per Change Actions:**

- **Copy Change ID**: Copy change ID (Ctrl+C)
- **Copy Commit ID**: Copy commit ID (Ctrl+Shift+C)
- **Edit Description...**: Navigate to describe view (Ctrl+E)
- **Create New Change...**: Navigate to new change view (Ctrl+N)

**Visual Indicators:**

- Bookmarks shown as tags
- Author and change ID in subtitle
- Current working copy highlighted

### New Change (`jj new-change <repo-path>`)

Interactive form for creating new changes:

**Form Actions:**

- **Create Change**: Submit form with description (Enter)
- **Cancel**: Return to previous view (Escape)

**Form Fields:**

- Description (required, multi-line)
- Optional: Revision to branch from

### Describe (`jj describe <repo-path>`)

Edit current change description:

**Form Actions:**

- **Save Description**: Submit form (Enter)
- **Cancel**: Return to previous view (Escape)

**Form Fields:**

- Description (multi-line text area)

### Diff (`jj diff <repo-path>`)

Shows working copy diff with copy operations:

**Actions:**

- **Copy Diff**: Copy entire diff to clipboard (Ctrl+C)
- **Copy Selected Lines**: Copy selected diff lines (Ctrl+Shift+C)

### Bookmarks (`jj bookmarks <repo-path>`)

Manage bookmarks with comprehensive operations:

**Per Bookmark Actions:**

- **Copy Bookmark Name**: Copy bookmark name (Ctrl+C)
- **Copy Change ID**: Copy bookmark's change ID (Ctrl+Shift+C)
- **Push to Remote**: Push bookmark to remote (Ctrl+P)
- **Track Remote**: Track remote bookmark (Ctrl+T)
- **Forget Bookmark**: Forget bookmark (Ctrl+F)
- **Delete Bookmark**: Delete bookmark (destructive, Ctrl+Delete)
- **Create New Bookmark...**: Navigate to bookmark creation form (Ctrl+N)
- **Push All Bookmarks**: Push all bookmarks (Ctrl+Shift+P)

**Bookmark Creation Form:**

- Bookmark Name (required)
- Revision (optional, defaults to current)

### Undo (`jj undo <repo-path>`)

Undo the last Jujutsu operation:

**Actions:**

- **Undo**: Execute undo (Enter)
- **Cancel**: Return to previous view (Escape)

### Squash (`jj squash <repo-path>`)

Squash changes into parent:

**Squash Options:**

- **Squash All**: Squash all changes into parent (Enter)
- **Interactive Squash**: Select specific changes to squash

**Actions:**

- **Execute Squash**: Perform squash operation (Enter)
- **Cancel**: Return to previous view (Escape)

### Split (`jj split <repo-path>`)

Split current change into multiple changes:

**Actions:**

- **Split Change**: Execute split (Enter)
- **Cancel**: Return to previous view (Escape)

**Interactive Process:**

- Edit file hunks to split
- Create multiple changes from one

### Abandon (`jj abandon <repo-path>`)

Abandon current change:

**Actions:**

- **Abandon**: Execute abandon (destructive, Enter)
- **Cancel**: Return to previous view (Escape)

### Resolve (`jj resolve <repo-path>`)

Resolve merge conflicts:

**When No Conflicts:**

- **Check Status...**: Navigate to status view (Ctrl+S)
- **View Log...**: Navigate to log view (Ctrl+L)

**When Conflicts Exist:**

- **Resolve All Conflicts**: Mark all files as resolved (Enter)
- **Resolve [file]**: Mark specific file as resolved ([number])
- **Edit File**: Open conflicted file in editor (Ctrl+E)
- **View Diff...**: Navigate to diff view (Ctrl+D)
- **Check Status...**: Navigate to status view (Ctrl+S)

### Edit (`jj edit <repo-path>`)

Time travel to different changes:

**Navigation Actions:**

- **Go to Change**: Edit to selected change (Enter)
- **Parent Change**: Go to parent (^, Ctrl+Up)
- **Child Change**: Go to child (Ctrl+Down)
- **Search Changes**: Filter changes by description
- **Copy Change ID**: Copy selected change ID (Ctrl+C)

**Change List:**

- Working copy highlighted
- Bookmarks shown as tags
- Change IDs and descriptions


## Keyboard Shortcuts

### Global Shortcuts (most commands)

- **Ctrl+C**: Copy primary content (names, IDs, paths)
- **Ctrl+Shift+C**: Copy secondary content (commit IDs, full paths)
- **Ctrl+Enter**: Execute primary action
- **Ctrl+[**: Go back / Cancel
- **Escape**: Cancel / Close

### Command-Specific Shortcuts

- **Ctrl+N**: Create new (changes, bookmarks)
- **Ctrl+E**: Edit (descriptions, files)
- **Ctrl+D**: View diff
- **Ctrl+L**: View log
- **Ctrl+S**: View status
- **Ctrl+B**: View bookmarks
- **Ctrl+P**: Push operations
- **Ctrl+T**: Track remote / Open terminal
- **Ctrl+Z**: Undo last operation
- **Ctrl+Delete**: Delete / Abandon operations

## CLI Wrapper

Use the companion `vjj.nu` script for command-line access to the extension:
All commands support the `--repo` (`-r`) flag to specify a repository path, defaulting to the current working directory when not provided.

```nu
# Source the script
source vjj.nu

# Use JJ-like commands
vjj main  # or just vjj (defaults to main)
vjj status
vjj log --repo /path/to/repo
vjj bookmarks
vjj undo
vjj squash
vjj split
vjj abandon
vjj resolve
vjj edit
```

The script uses Vicinae deeplinks to launch the different extension commands.

```bash
# Log
open "vicinae://extensions/knoopx/jujutsu/log?arguments={\"repo-path\":\"/path/to/repo\"}"

# Bookmarks
open "vicinae://extensions/knoopx/jujutsu/bookmarks?arguments={\"repo-path\":\"/path/to/repo\"}"
```

## Development

- `npm run dev` — run `vici develop` while building the extension
- `npm run build` — build distributable assets with `vici build`
- `npm run typecheck` — run `tsc --noEmit` against the `src/` tree
- `npm run lint` — alias for the same TypeScript check until we add a dedicated linter
