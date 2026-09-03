# Changelog

## [1.1.0] - 2026-09-03

### Added

- Instant **Generate HTML** no-view command.
- Character budget in the preview search bar (`120c`, `80 chars`).
- List style preference: markdown dashes, numbered, or HTML `<ul>`.
- HTML wrap preference: `<p>` or `<div>`.
- Per-command default count when you omit the argument.
- Preview remembers the last type you used.

### Changed

- Typing a count in preview shows only that result, not the whole preset list.
- Changing the type dropdown no longer fights a suffix still in the search bar (`5w` then Paragraphs becomes 5 paragraphs).
- In preview, Enter pastes into the frontmost app; copy and regenerate use Vicinae's generic action keybinds.

## [1.0.0] - 2026-08-17

First release for [Vicinae](https://vicinae.com) on Linux and macOS.

### Added

- Preview command to generate paragraphs, sentences, words, titles, lists, and HTML.
- Instant no-view commands for paragraphs, sentences, words, and lists.
- Default action pastes into the frontmost app; copy or paste-and-copy remain available.
- Classic *Lorem ipsum dolor sit amet…* opening, with a preference to turn it off.
