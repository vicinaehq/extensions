# MPD — Vicinae extension

Browse and control your [Music Player Daemon](https://www.musicpd.org/) library
from Vicinae: view the play queue with album art, browse albums, and search
songs.

## Features

- **Play queue** with album covers — jump to a song or remove it from the queue.
- **Album browser** sorted by recently added — play an album or append it to
  the queue.
- **Song search** across title, artist, and album with substring / token-AND
  matching.
- **Album art** resolved via MPD's `readpicture` (embedded art) with a
  fallback to `albumart` (folder art), cached locally.
- **Webradio streams** in the queue: the currently-playing track (from ICY
  metadata) is shown on top, with the station name underneath. When the
  stream provides embedded cover art (e.g. FLAC streams with a picture
  block), MPD's `readpicture` is invoked once for the active stream with
  a short timeout and the result is cached; otherwise a generic stream
  icon is shown. ICY title changes are picked up automatically while a
  stream is playing.
- **Station icons** are resolved from several sources in priority order:
  embedded stream art (MPD's `readpicture`) first, then the curated
  [WebradioDB](https://github.com/jcorporation/webradiodb) image set
  (fetched by stream URL from its GitHub Pages CDN), then the
  radio-browser favicon. When none match, a generic stream glyph is shown.
  Every downloaded image is validated (magic-byte sniffing plus a minimum
  size) so broken, empty, or HTML-error responses are never cached or
  displayed.
- **Station enrichment** via
  [radio-browser.info](https://www.radio-browser.info): stream rows that
  arrive in the queue without a `Name` tag (e.g. added with bare
  `mpc add http://…`) are enriched with the station name and logo from
  the community directory, looked up by stream URL. If no station matches
  the exact URL, the lookup falls back to a name-based search (using MPD's
  `Name` tag, picking the highest-voted online station) — this raises the
  hit rate for streams whose queue URL differs from the one registered in
  the directory. Only your queue's stream URLs and host identities are sent
  to third parties (radio-browser, and GitHub Pages for WebradioDB); when an
  exact URL match fails, the station `Name` tag is also sent to
  radio-browser's search. No other MPD data (your library, tags, or
  listening history) ever leaves your machine. Results are cached locally
  (positive: 7 days; negative: 1 day) so repeat opens don't hit the network.

## Commands

| Command | Description |
|---|---|
| **Show Play Queue** | Current queue with covers; jump to or remove songs. |
| **Show Albums** | All albums by last added; play or append an album to the queue. |
| **Search Songs** | Search the library by title, artist, or album. |

## Requirements

- A running MPD server reachable over TCP or a Unix socket — see
  [Configuration](#configuration).
- A recent MPD version that supports `readpicture` / `albumart` if you want
  cover art.
- No extra CLI tools required; the extension talks to MPD directly via the
  bundled `mpc-js` client.

## Configuration

The extension reads `MPD_HOST` and `MPD_PORT` from the environment. Defaults:

- `MPD_HOST` = `localhost`
- `MPD_PORT` = `6600`

If `MPD_HOST` is an absolute path (e.g. `/run/user/1000/mpd/socket`), it is
treated as a Unix socket and `MPD_PORT` is ignored.

### Station enrichment endpoint

The station-name / favicon lookup uses radio-browser.info's DNS SRV pool by
default. To pin a specific mirror (or disable enrichment by pointing at an
unreachable host), set `RADIO_BROWSER_API`:

```
RADIO_BROWSER_API=https://at1.api.radio-browser.info
```

## Troubleshooting

### "Cannot connect to MPD"

- Confirm `mpc status` (or your client of choice) works in a terminal.
- Verify `MPD_HOST` and `MPD_PORT` match your `mpd.conf`.
- For Unix sockets, ensure the running user has read/write access to the
  socket file.

### Empty album / song list

- Make sure MPD has scanned your `music_directory` (`mpc update` and wait for
  it to finish).
- Tag-less files won't appear under albums; check with `mpc listall`.

### Album covers missing

- Embedded art requires an MPD build with `readpicture` support.
- Folder art requires `cover.jpg` / `cover.png` / `folder.jpg` next to the
  audio files and MPD's `albumart` support.

## Development

```
npm install
npm run dev
```

Make sure Vicinae is running.

## Tests

```
npm test
npm run typecheck
```

## License

MIT
