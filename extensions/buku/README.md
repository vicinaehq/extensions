# Buku

Browse, add, edit, and tag your [buku](https://github.com/jarun/buku) bookmarks from Vicinae.

## Requirements

The `buku` command line tool must be installed and reachable from Vicinae.

```bash
# Arch Linux
sudo paru -S buku

# any distribution
pipx install buku
```

Vicinae runs extensions with the PATH of your desktop session, which often does not
include `~/.local/bin`. The extension already looks in `~/.local/bin`, `/usr/local/bin`,
and `/opt/homebrew/bin` on top of the inherited PATH. If your buku lives somewhere else,
set **Additional PATH Entries** in the extension preferences to a colon separated list of
directories.

Bookmarks are read from and written to your normal buku database — this extension never
keeps a copy of its own.

## Commands

### Search Bookmarks

Fuzzy search across titles, URLs, and tags. Tags are shown as accessories on each row and
are matched by the search field.

| Action | Default shortcut |
| --- | --- |
| Open in browser | `Enter` |
| Copy URL | `Ctrl+Shift+C` |
| Edit bookmark | `Ctrl+E` |
| Add bookmark | `Ctrl+N` |
| Delete bookmark | `Ctrl+X` |
| Show / hide details | `Ctrl+Shift+D` |
| Refresh | `Ctrl+R` |

Apart from the detail toggle these are Vicinae's named action shortcuts, so they follow
any rebinding you make in Vicinae's keybind settings. Note that the panel labels the first
two actions of a list `Enter` and `Shift+Enter` regardless of the shortcut they declare —
the declared one keeps working, it is just not the one shown.

The detail pane shows the bookmark's description, which has nowhere to go on a single
row, along with its URL, tags, and buku ID. Refresh re-reads the database, which is worth
doing after changing bookmarks with the `buku` CLI itself.

### Add Bookmark

Opens a form prefilled with the URL from your clipboard when it holds one. Leave the
title empty and buku fetches it from the page; type one and the fetch is skipped. The form
stays open after saving, so several bookmarks can be added in a row.

Note that buku's title fetch has no timeout of its own, so an unreachable host stalls the
save until the extension cuts it off after 30 seconds. Filling in the title avoids the
network entirely.

## Tags

Both the add and the edit form take a comma separated tag list, and `Ctrl+T` opens a
picker over the tags already in your database:

- `Enter` toggles a tag
- typing a name that does not exist yet offers to create it
- `Ctrl+S` closes the picker, as does `Escape` — the selection is applied either way

Tags are lowercased and de-duplicated before they reach buku, matching how buku stores
them. Clearing every tag on an existing bookmark removes them all — buku ignores an empty
`--tag`, so the extension issues the explicit removal for you.

## Development

```bash
npm install
npm run dev    # live reload into a running Vicinae
npm run build  # production bundle
npm run lint
```

## License

MIT.

The extension icon is the 🔖 glyph from [Noto Emoji](https://github.com/googlefonts/noto-emoji),
Copyright 2013 Google LLC, licensed under the Apache License 2.0.
