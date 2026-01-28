# Git Editor

Use Vicinae as your git editor for commits and interactive rebases.

## Features

### Git Commit

Write commit messages with a user-friendly interface. Choose between two commit styles:

- **Conventional Commits** - Structured commit messages with type, scope, and breaking change indicators
  - Types: `feat`, `fix`, `docs`, `ci`, `wip`
  - Optional scope
  - Breaking change flag
- **Simple** - Free-form commit message

You can swap between commit styles at any time while writing your message.

### Interactive Rebase

A visual interface for `git rebase -i` with full control over your commits:

- **Reorder commits** - Move commits up/down with `Ctrl+W` / `Ctrl+S`
- **Change commit actions** - Quick shortcuts for common operations:
  - `p` - Pick
  - `e` - Edit
  - `r` - Reword
  - `f` - Fixup
  - `d` - Drop

Commits are displayed with their hash, message, date, and current action (color-coded).

## Setup

The extension includes a built-in setup wizard. When you first run it:

1. Open the Git Commit or Git Sequence command in Vicinae
2. Press `Ctrl+Enter` to automatically configure git

This sets the following git configuration:

```bash
git config --global core.editor "git-vicinae-editor"
git config --global sequence.editor "git-vicinae-sequence-editor"
```

## Usage

After setup, simply use git as normal:

```bash
# For commits
git commit

# For interactive rebase
git rebase -i HEAD~5
```

Vicinae will automatically open with the appropriate interface.

## Preferences

| Name | Type | Default | Description |
|------|------|---------|-------------|
| Commit Type | Dropdown | Conventional Commits | Choose between Conventional Commits or Simple format |

