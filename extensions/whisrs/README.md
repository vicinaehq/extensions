# Whisrs for Vicinae

A [Vicinae](https://docs.vicinae.com/) extension that controls [whisrs](https://github.com/y0sif/whisrs) — the Linux-first voice-to-text dictation tool.

## Features

- **Live status** — see whether the daemon is running, recording, and which backend is active, with quick actions to start/stop recording and restart the daemon.
- **Transcription history** — browse, search, copy, paste, and delete past transcriptions, or clear them all.
- **Push-to-talk** — toggle dictation with a single hotkey, falling back to the whisrs CLI.
- **Text-to-speech** — read the current selection aloud via whisrs TTS.
- **Easy setup** — launch the interactive `whisrs setup` without leaving Vicinae.

## Requirements

- Linux with [`whisrs`](https://github.com/y0sif/whisrs) installed and set up (`whisrs setup`).
- The whisrs binary must be on your `PATH`, or set the **Whisrs Binary Path** preference to its absolute location.

## Commands

| Command | Mode | Description |
| --- | --- | --- |
| **Whisrs Status** | view | Query the daemon, show running/recording state and active backend. Start/stop recording, restart the daemon, or open setup from the action panel. |
| **Transcription History** | view | Browse recent transcriptions. Copy, paste, or remove entries; clear history. |
| **Toggle Recording** | no-view | Start/stop dictation (`whisrs toggle`). |
| **Read Selection Aloud** | no-view | Read the selected text aloud via whisrs TTS (`whisrs speak`). |
| **Whisrs Setup** | no-view | Run the interactive `whisrs setup` in a terminal. |
| **Restart Daemon** | no-view | Restart `whisrsd` (`whisrs restart`). |

## Preferences

- **Whisrs Binary Path** — override the `whisrs` executable location (defaults to `whisrs` on `PATH`).
- **History Limit** — number of entries fetched by the history command (5/10/20/50, default 10).

## Install

Build the extension and install it into Vicinae:

```bash
npx vici build
npx vici install   # or point Vicinae at the built artifact
```

Then enable **Whisrs** from the Vicinae extensions list and run a command from the search bar (e.g. "Whisrs Status").

## Development

```bash
npm install
npx vici develop   # live reload against a running Vicinae
npx vici build     # produce a build artifact
npx vici lint      # validate the manifest
```

## Notes

`whisrs toggle` and `whisrs speak` are fire-and-forget: they hand off to the running
daemon, so the extension only signals success/failure of issuing the command. Use the
**Whisrs Status** command to confirm the live recording state.

## License

MIT
