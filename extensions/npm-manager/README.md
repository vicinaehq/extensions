# NPM Manager

Manage JavaScript/TypeScript dependencies in the current project directly from Vicinae.

This extension provides three commands:

- `npm-install`
- `npm-uninstall`
- `npm-update`

It detects your package manager (`npm`, `pnpm`, or `bun`) and runs the matching install/uninstall/update command in the project directory.

## What it does

| Command | What it does |
| --- | --- |
| `npm-install` | Search and install packages |
| `npm-uninstall` | Select installed packages and remove them |
| `npm-update` | Show outdated packages and update selected ones to `@latest` |


## Usage

This extension should be launched with a project path (`pwd`) from terminal context.

If `pwd` is missing, the command shows an in-app detail view with deeplink examples.

### Deeplinks

- `vicinae://extensions/FredrikMWold/npm-manager/npm-install`
- `vicinae://extensions/FredrikMWold/npm-manager/npm-uninstall`
- `vicinae://extensions/FredrikMWold/npm-manager/npm-update`

### Recommended aliases (`~/.bashrc`)

```bash
alias npmi='vicinae "vicinae://extensions/FredrikMWold/npm-manager/npm-install?arguments={\"pwd\":\"$(pwd)\"}"'
alias npmr='vicinae "vicinae://extensions/FredrikMWold/npm-manager/npm-uninstall?arguments={\"pwd\":\"$(pwd)\"}"'
alias npmu='vicinae "vicinae://extensions/FredrikMWold/npm-manager/npm-update?arguments={\"pwd\":\"$(pwd)\"}"'
```