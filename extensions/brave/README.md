# Brave

Search bookmarks, history, tabs, and the web, and open windows in the [Brave](https://brave.com/) or [Brave Origin](https://brave.com/origin/) browser.

## Commands

- **Search Bookmarks** — search bookmarks across all profiles of the installed Brave or Brave Origin browser.
- **Search History** — search browsing history across all profiles of the installed browser.
- **New Tab** — open a new tab in the installed browser.
- **Search Tabs** — search, switch to, and close open tabs of the installed browser.
- **Search Web** — search the web with the browser's default search engine, with suggestions.
- **New Window** — open a new browser window.
- **New Private Window** — open a new private (incognito) browser window.

## Preferences

- **Browser** — which install to target: Brave, Brave Origin, or auto-detect. Auto uses the installed variant and prefers the running one when both are installed.
- **Profile Directory** — location of the browser user data directory, relative to your home directory. Leave empty for the default (`~/.config/BraveSoftware/Brave-Browser` for Brave, `~/.config/BraveSoftware/Brave-Origin` for Brave Origin).
- **Debug Port** — optional override of the remote debugging port used for **Search Tabs**. Leave empty to auto-detect.

## Notes

- Both Brave and Brave Origin are Chromium-based: bookmarks, history, and the default search engine are read directly from the browser's local profile files.
- **Search Web** uses the search engine configured in the browser's settings and fetches suggestions from it. If that endpoint is unavailable or returns no suggestions, the query is sent to Google's suggestion endpoint as a fallback (network access).
- List items show site favicons: open tabs use the favicon the browser reports, while bookmarks, history, and typed URLs fetch one from Google's favicon service (network access). Entries without a reachable favicon fall back to a built-in icon.
- **Search Tabs** talks to the browser over its remote debugging endpoint, which Chromium can only enable when it starts. No manual setup is needed in most cases: windows and tabs opened through this extension launch the browser with an ephemeral debugging port that is discovered automatically. If the browser was started some other way without debugging, **Search Tabs** offers a one-click action that writes `--remote-debugging-port=9222` to the launcher flags file (`~/.config/brave-browser-flags.conf` or `~/.config/brave-origin-flags.conf`) and restarts the browser.
- The `brave-browser` / `brave-origin` binaries must be available on your `PATH` for the window and tab commands.