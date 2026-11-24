# Screenshots

Vicinae extension to search your screenshots, preview them and paste or copy them.

## Search Screenshots

Shows PNG, JPEG and WebP files from the screenshots directory as a grid of previews, newest first, grouped by day. Each cell shows the time taken and the image dimensions; hover for the file name and size. Search matches file names and day labels.

| Action | Shortcut |
| --- | --- |
| Paste into the active app | `Enter` |
| Copy to clipboard | Copy shortcut |
| Show full preview in a floating [imv](https://sr.ht/~exec64/imv/) window | `Ctrl+Y` |
| Open / Open With / Show in File Browser | Open shortcuts |
| Copy path | Copy Path shortcut |
| Move to trash (asks for confirmation) | Remove shortcut |
| Refresh | Refresh shortcut |

Paste and copy put the file on the clipboard as a file reference (`text/uri-list`), the same way Vicinae's own clipboard API handles files.

The full preview opens in imv because extensions can't resize the Vicinae window. The window floats in the top-right corner of the focused monitor at 0.75× the screenshot's pixel size, keeping its aspect ratio; screenshots too large for the monitor at that size shrink further to fit. This needs Hyprland with its Lua config (window rules are passed to `hl.dsp.exec_cmd` through `hyprctl dispatch`) and imv on `PATH` (Omarchy ships it). In imv, `q` quits and scrolling zooms.

## Preferences

- **Screenshots Directory**: where screenshots are read from. Default `~/Pictures/Screenshots`. Subdirectories are not scanned.
- **Grid Columns**: 2 (default), 3 or 4 per row. Fewer columns give larger previews.

## Development

```bash
npm install
npm run dev     # live development session, Vicinae must be running
npm run build   # production bundle
npm run lint    # validate the manifest
```
