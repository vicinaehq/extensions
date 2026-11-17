# Changelog

## 1.0.0

First release. A ground-up rewrite for Vicinae of the Raycast extension
[Kaset Control](https://www.raycast.com/endiruslan/kaset-control).

### Added

- **Play Queue** view, built on Kaset's `get play queue` and `play track at index`.
- **Play Video by ID**, accepting a bare video ID or any YouTube, YouTube Music or
  youtu.be link.
- Separate **Play** and **Pause** commands, on top of the play/pause toggle.
- **Volume Up** and **Volume Down**, stepping by a configurable amount.
- A **Show a HUD after background commands** preference, for silent global shortcuts.

### Changed

- Rewritten against the Vicinae API. No Raycast dependencies.
- Every command now reads Kaset's resulting state back in the same `osascript`
  call instead of guessing it from an earlier read, so the feedback matches what
  actually happened even when the state changed outside the extension.
- One `osascript` process per action instead of three.
- Now Playing gained artwork, a live progress bar and a metadata panel.
- Set Volume accepts any value typed into the search bar, not just preset steps.

### Fixed

- Commands could hang indefinitely when Kaset stopped answering Apple events.
  Every call is now bounded by both an AppleScript timeout and a process kill.
- Errors are told apart and explained: Kaset not installed, not running, still
  starting up, unresponsive, or Automation permission denied.
- Views no longer flash "Kaset is not running" on their first render.
- Next and Previous report the track they actually landed on.

### Notes

- The Raycast extension this was ported from had a menu bar command. This
  extension does not expose one — use *Now Playing* instead.
