<div align="center">

<img src="assets/extension_icon.png" width="128" alt="">

# Kaset for Vicinae

Control [Kaset](https://github.com/sozercan/kaset) — the unofficial YouTube Music client for macOS — from [Vicinae](https://github.com/vicinaehq/vicinae).

</div>

Written against the native Vicinae API. It talks to Kaset over AppleScript and covers every command in Kaset's scripting dictionary.

It is a ground-up rewrite of the Raycast extension [Kaset Control](https://www.raycast.com/endiruslan/kaset-control) by Ruslan Hryshchenko ([@endiruslan](https://github.com/Endiruslan)) — see [Credits](#credits).

## Requirements

- macOS, with [Kaset](https://github.com/sozercan/kaset) installed.
- Vicinae. Built against the `@vicinae/api` 0.28.1 declarations.

## Installation

The easiest way is the extension store command inside Vicinae.

To build it from source instead, clone this repository and build the extension in place:

```bash
git clone https://github.com/vicinaehq/extensions
cd extensions/extensions/kaset
npm install
npm run build
```

`npm run build` compiles the extension and installs it into Vicinae's extension directory (`~/.local/share/vicinae/extensions/kaset`). Vicinae watches that directory, so the commands appear in the launcher straight away — no restart needed.

To confirm it loaded:

```bash
vicinae cmd ls | grep kaset
```

## Commands

| Command | What it does |
| --- | --- |
| Now Playing | Artwork, live progress bar, and a metadata panel with volume, shuffle, repeat and rating. All controls in one action panel. |
| Play Queue | The queue grouped into Now Playing, Up Next and Earlier, so it opens on the track that is playing. Jump to any track from there. |
| Set Volume | Preset levels plus free entry — type any number from 0 to 100. |
| Play Video by ID | Plays a video ID, or any YouTube / YouTube Music / youtu.be link you paste. |
| Toggle Play/Pause | Toggles playback. |
| Play, Pause | Explicit start and stop, handy for global shortcuts and automations. |
| Next Track, Previous Track | Skips, and reports the track it actually landed on. |
| Volume Up, Volume Down | Steps the volume by the amount set in preferences. |
| Toggle Mute | Mutes and unmutes. |
| Toggle Shuffle | Turns shuffle on or off. |
| Cycle Repeat | Cycles off → all → one. |
| Like Track, Dislike Track | Rates the current track, or clears an existing rating. |

Every background command is a `no-view` command, so it can be bound to a global shortcut in Vicinae's settings.

## Development

```bash
npm install
npm run dev        # vici develop, against a running `vicinae server`
npm run build      # compile and install into Vicinae
npm run lint       # validate the manifest
npm run typecheck
npm run format
```

`npm run dev` starts a development session that rebuilds on save. Extension logs are tailed into that terminal.

## Credits

This extension started life as a port of **[Kaset Control](https://www.raycast.com/endiruslan/kaset-control)**, the Raycast extension by **Ruslan Hryshchenko** ([@endiruslan](https://github.com/Endiruslan)) — source at [Endiruslan/kaset-raycast](https://github.com/Endiruslan/kaset-raycast).

Kaset itself is by **Sertaç Özercan** ([sozercan/kaset](https://github.com/sozercan/kaset)); its AppleScript dictionary is what makes any of this possible, and **the cassette artwork is theirs too** — taken from Kaset's own icon source so it stays sharp at any size.

The sixteen per-command icons are the work of **[@tiagem](https://github.com/tiagem)**, with thanks.

## License

[MIT](LICENSE).