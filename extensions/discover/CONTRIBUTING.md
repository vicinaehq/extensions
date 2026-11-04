# Contributing

This project targets CachyOS and Arch Linux, with Vicinae 0.29.2 as the tested SDK baseline. Keep user-facing text in English and use native Vicinae APIs for UI, navigation and terminal launching.

## Local checks

```sh
npm ci
npm run format:check
npm run lint
npm run check
npm run build:bundle
```

`npm run build:bundle` writes to `dist/` without installing the extension. Use `npm run dev` for Vicinae development mode, or `npm run build` to install it locally.

`npm run smoke` queries the original CachyOS development host and assumes specific packages and repositories exist. It is intentionally excluded from portable CI. It does not execute package changes.

## Package-management changes

- Pass process arguments as arrays. Never construct shell commands from discovered package metadata or remote responses.
- Preserve repository priority, Flatpak installation scope and full package references.
- Keep repository refresh and full Arch system upgrades together.
- Show transaction scope before any mutation and preserve failures in transaction history.
- Keep firmware updates separate from package upgrades and never restart the computer automatically.
- Add regression tests when changing command construction, parsers, locking or job lifecycle behavior.
- Test privileged operations in a disposable virtual machine before describing them as verified.

Open a focused pull request describing the user-visible behavior and the checks performed. State any remaining platform or transaction limitations. Do not include dependencies, compiled bundles, transaction logs or local credentials in commits.

## Vicinae store updates

The standalone repository is the development source. Store submissions go to [`vicinaehq/extensions`](https://github.com/vicinaehq/extensions), under `extensions/discover/`. Submit readable source and the npm lockfile; omit `.git`, `node_modules`, `dist`, standalone GitHub workflows and generated Python caches. Keep the store copy synchronized with a specific commit from this repository and include that commit in the pull request description.

Follow the upstream [publication rules](https://github.com/vicinaehq/extensions/blob/main/skills/extension-reviewer/SKILL.md). A submitted pull request is not a published store release; maintainers must review and merge it first.
