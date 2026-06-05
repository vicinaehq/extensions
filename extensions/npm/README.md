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

- `vicinae://launch/@FredrikMWold/npm/npm-install`
- `vicinae://launch/@FredrikMWold/npm/npm-uninstall`
- `vicinae://launch/@FredrikMWold/npm/npm-update`

### Recommended aliases (`~/.bashrc`)

```bash
npmi() {
    vicinae 'vicinae://launch/@FredrikMWold/npm/npm-install?arguments={"path":"'"$(pwd)"'"}'
}
npmr() {
    vicinae 'vicinae://launch/@FredrikMWold/npm/npm-uninstall?arguments={"path":"'"$(pwd)"'"}'
}
npmu() {
    vicinae 'vicinae://launch/@FredrikMWold/npm/npm-update?arguments={"path":"'"$(pwd)"'"}'
}
```
