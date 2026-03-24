# NerdFonts

Search Nerd Font icons in Vicinae and copy glyph values in multiple formats.

## What It Does

- Search icons by name, identifier, and fuzzy token matching.
- Copy any result as:
  - glyph
  - Nerd Font name
  - identifier
  - Unicode codepoint
  - HTML entity
- Keep a local recent-copies list (up to 24 icons).

## Commands

| Command            | Description                                  | Mode |
| ------------------ | -------------------------------------------- | ---- |
| `nerdfonts-search` | Search Nerd Font icons and copy glyph values | View |

## Preferences

This extension currently has no user-configurable preferences.

## Requirements

- Node.js 20+

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

Tests run with Node's test runner and `tsx`:

```bash
node --import tsx --test test/*.test.ts
```

## Search Index

The extension bootstraps its icon index at runtime from Nerd Fonts upstream data and caches the serialized index locally.

## Notes

- Icon pack filtering is currently behind a feature flag and disabled (`ENABLE_PACK_FILTER = false`).
