# Helium

Search bookmarks, history, tabs, and the web, and open windows in the [Helium](https://helium.computer/) browser.

## Commands

- **Search Bookmarks** — search bookmarks across all Helium profiles.
- **Search History** — search browsing history across all Helium profiles.
- **New Tab** — open a new tab in Helium.
- **Search Tabs** — search, switch to, and close open Helium tabs.
- **Search Web** — search the web with Helium's default search engine, with suggestions.
- **New Window** — open a new Helium window.
- **New Private Window** — open a new private (incognito) Helium window.

## Preferences

- **Profile Directory** — location of the Helium user data directory, relative to your home directory (default: `.config/net.imput.helium`).
- **Debug Port** — optional override of the remote debugging port used for **Search Tabs**. Leave empty to auto-detect.

## Notes

- Bookmarks, history, and the default search engine are read directly from Helium's local profile files.
- **Search Web** uses the search engine configured in Helium's settings and fetches suggestions from it. If that endpoint is unavailable or returns no suggestions, the query is sent to Google's suggestion endpoint as a fallback (network access).
- List items show site favicons: open tabs use the favicon Helium reports, while bookmarks, history, and typed URLs fetch one from Google's favicon service (network access). Entries without a reachable favicon fall back to a built-in icon.
- **Search Tabs** talks to Helium over its remote debugging endpoint, which Chromium can only enable when the browser starts. No manual setup is needed in most cases: windows and tabs opened through this extension launch Helium with an ephemeral debugging port that is discovered automatically. If Helium was started some other way without debugging, **Search Tabs** offers a one-click action that writes `--remote-debugging-port=9222` to `~/.config/helium-browser-flags.conf` and restarts Helium.
- The `helium-browser` (or `helium`) binary must be available on your `PATH` for the window and tab commands.
