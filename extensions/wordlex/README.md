# WordLex Dictionary — Vicinae Extension

Search **150,000+ English words** with definitions, synonyms, antonyms, and semantic relations — fully offline, from the [Vicinae](https://github.com/vicinaehq/vicinae) launcher.

## Commands

| Command | Description |
|---------|-------------|
| **Search Dictionary** | Searchable list with inline definitions, synonyms, antonyms, and examples |
| **Define Clipboard Word** | Look up the word in your clipboard or text selection |
| **Random Word** | Discover a random word — great for vocabulary building |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | View full definition |
| `Cmd+C` | Copy definition |
| `Cmd+Shift+P` | Paste word into active app |
| `Cmd+W` | Open in Wiktionary |
| `Cmd+O` | Open in WordLex desktop app |

## Prerequisites

The [WordLex](https://github.com/vedesh-padal/wordlex) desktop app must be installed with the `wordlex` binary on your `$PATH`.

→ [Download latest release](https://github.com/vedesh-padal/wordlex/releases)

## How It Works

The extension shells out to the installed `wordlex` binary. It reuses the same SQLite database and query logic from the desktop app — zero data duplication.

```
wordlex --search-json <prefix>   → prefix search results as JSON
wordlex --cli-json <word>        → full word detail as JSON
wordlex --random-json            → random word detail as JSON
```

## Development

```bash
npm install       # install dependencies
npm run dev       # watch mode
npm run build     # production build
```

## License

MIT — [vedesh-padal](https://github.com/vedesh-padal)
