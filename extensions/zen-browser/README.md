# Zen Browser for Vicinae

Native Vicinae extension for Zen Browser on Linux. It mirrors the Raycast Zen Browser extension where Linux allows it: new tab/search, new window, private window, history search, bookmark search, workspace listing, and window focusing.

## Requirements

- Zen Browser installed. Default command: `flatpak run app.zen_browser.zen`.
- `sqlite3` CLI for history/bookmark/workspace search.
- `wmctrl` for focusing windows.

## Notes

Zen history/bookmarks live in `places.sqlite`. The extension copies that database to `/tmp` before querying so it can read data while Zen is running.
