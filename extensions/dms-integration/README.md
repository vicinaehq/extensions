# Dux Shell Vicinae Extension

Integrate [Dux Shell](https://github.com/duxlabs-dev/dux-shell) into Vicinae: search files, reindex, open settings and notepad, and open settings categories directly from **Vicinae's main search**.

Dux Shell still uses the `dms` CLI and `dsearch` backend. The extension ID and existing command IDs remain unchanged for compatibility.

## Settings in the main search

Type a category or keyword directly in Vicinae, without opening an extension view first:

- `wallpaper` → **Wallpaper & colors**
- `blur` → **Interface style**
- `fonts` → **Fonts & motion**
- `browser` → **Applications**
- `wi-fi` → **Network**

Each of the 24 top-level categories is a `no-view` command with its original Dux category icon, a small Dux-logo badge in the bottom-left corner, slightly overlapping the outer edge, a description and separate search keywords. Press Enter to open the category through `dms ipc call settings openWith <category>`. No Dux modifications or plugins are required.

Vicinae controls main-search ranking, including keyword weights, fuzzy matching, aliases, favorites and usage history. Titles are supplied separately from keywords so they receive native title weighting; this extension does not impose a custom scoring algorithm or guarantee a fixed result order. Category hints are displayed in command subtitles. Individual settings and child pages are **not** exposed as commands, although child-page labels and descriptions contribute keywords.

## Other commands

- **Search Files** — search indexed files through [dsearch](https://github.com/duxlabs-dev/dux-search), available on `localhost:43654` by default (configurable in extension preferences). The optional folder argument is relative to your home directory, unless it starts with `/`. Absolute paths must be allowed by your dsearch configuration.
- **Reindex Files for Search** — start a `quick` or `full` reindex asynchronously.
- **Settings** — open the Dux Shell settings panel.
- **Notepad** — toggle the Dux Shell notepad.

## Category metadata and icons

The settings commands in `package.json` are a snapshot of the 24 top-level categories from Dux Shell v2.0.0's `quickshell/Common/SettingsTabs.qml`. Category IDs, English titles, descriptions, aliases and child-page keywords are bundled, not parsed from QML at runtime. The list does not dynamically reflect hardware-dependent visibility or plugin pages. Update the manifest and corresponding `src/settings-*.ts` entrypoints when Dux changes its sidebar; older versions may not support all category IDs.

The category SVGs in `assets/settings/` use the same Material Symbols Rounded glyphs as Dux, extracted from its bundled variable font at FILL=0, GRAD=0, opsz=24, wght=400. They use fixed sidebar-group colors and a contrasting Dux-logo badge; they do not follow the current shell palette. The extension logo and badge come from Dux Shell's `assets/dev.duxlabs.shell.svg`.

Sources: [Dux settings categories](https://github.com/duxlabs-dev/dux-shell/blob/master/quickshell/Common/SettingsTabs.qml), [Dux shared UI resources](https://github.com/duxlabs-dev/dux-qml-common). Dux-derived metadata and logo retain their MIT notice in `assets/LICENSE-Dux-Shell.txt`; Material Symbols retain their Apache 2.0 license in `assets/settings/LICENSE-Material-Symbols.txt`.

## Local development

```sh
npm ci
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run dev              # register/refresh the development extension and watch changes
```

An installed store copy can coexist with the development copy. The updated commands display **Dux Shell** in their subtitles; an older store copy may still display **DMS**.
