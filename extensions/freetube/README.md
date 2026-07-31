# FreeTube for Vicinae

Search YouTube, open videos, channels and playlists, and jump straight to your
feeds — all inside [FreeTube](https://freetubeapp.io), without opening a browser.

## Requirements

- [Vicinae](https://vicinae.com)
- [FreeTube](https://freetubeapp.io), registered as the handler for
  `freetube://` links (the official packages do this on install)

## Commands

| Command | Argument | What it does |
|---|---|---|
| Search YouTube | query | Opens the YouTube search results in FreeTube |
| Open in FreeTube | URL, ID or `@handle` | Detects what you pasted and opens it |
| Play Top Result | query | Searches YouTube and plays the first video straight away |
| Open Trending | — | Opens the Trending feed |
| Open Subscriptions | — | Opens your Subscriptions feed |
| Open History | — | Opens your watch History |
| Bookmarks | — | Saves and reopens YouTube links you use often |

### What "Open in FreeTube" accepts

Anything you are likely to have on your clipboard:

- Video links — `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`, `/live/…`,
  `/embed/…`, with or without `https://`, from `m.` or `music.` subdomains
- Channels — `@handle`, `youtube.com/@handle`, `youtube.com/channel/UC…`, or a
  bare `UC…` ID
- Playlists — `youtube.com/playlist?list=…` or a bare `PL…` / `OLAK5uy_…` ID
- Bare video IDs such as `dQw4w9WgXcQ`

Links are normalised before they reach FreeTube: tracking parameters like `si`
and `pp` are dropped, while a `t` timestamp or `list` context is kept. That also
means the same video saved twice from two different share links produces one
bookmark rather than two.

## Development

```bash
npm install
npm run dev     # run the extension in development mode
npm run build   # production bundle
npm test        # unit tests (node:test)
npm run lint    # biome linter + manifest validation
npm run format  # biome formatter
```

`src/youtube.ts` is covered by `tests/youtube.test.ts`. It grew out of a real
bug — Open and Bookmarks each had their own parser and had drifted apart, so
some playlist IDs worked in one command and not the other. If you touch URL
handling, add a case there.

### Layout

| Path | Responsibility |
|---|---|
| `src/youtube.ts` | Recognises user input and produces canonical YouTube URLs |
| `src/freetube.ts` | Hands a URL to FreeTube and reports success or failure |
| `src/bookmark-store.ts` | Bookmark persistence on top of `LocalStorage` |
| `src/errors.ts` | Turns a caught exception into a failure toast |
| `src/*.ts`, `src/*.tsx` | One file per command, named after its `package.json` entry |

Commands stay thin: they validate their argument, then delegate. URL parsing
lives in `src/youtube.ts` only — please don't add a second copy.

## License

MIT
