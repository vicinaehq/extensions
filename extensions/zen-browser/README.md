# Zen Browser for Vicinae

Native Vicinae extension for Zen Browser on Linux. It mirrors the Raycast Zen Browser extension where Linux allows it: new tab/search, new window, private window, history search, bookmark search, pinned tab listing, workspace listing, and window focusing.

## Requirements

- Zen Browser installed. Default command: `flatpak run app.zen_browser.zen`.
- `sqlite3` CLI for history/bookmark/workspace search.
- `wmctrl` for focusing windows.
- Python 3 with `lz4.block` support for reading Zen/Firefox `*.jsonlz4` session backups when listing pinned tabs.

## Notes

Zen history/bookmarks live in `places.sqlite`. The extension copies that database to `/tmp` before querying so it can read data while Zen is running.

Pinned tabs are read from Zen's native Firefox-style session backups (`sessionstore-backups/recovery.jsonlz4`, falling back to `previous.jsonlz4`). This is read-only: the extension lists pinned tabs and can open/copy their URLs, but it does not close tabs, focus individual live tabs, or modify session files.
