# Wikipedia

A [Vicinae](https://github.com/vicinaehq/vicinae) extension for searching and reading Wikipedia articles.

Ported from the [Raycast Wikipedia extension](https://github.com/raycast/extensions/tree/main/extensions/wikipedia) by vimtor.

## Features

- Search Wikipedia articles by title
- View full article content with markdown rendering
- **List/Grid view** toggle for search results
- **Multi-language support** - 33 languages including CJK variants
- **Recent articles** - automatically tracks your reading history (up to 20 per language)
- **Article metadata** - toggle a sidebar with structured metadata
- **In-app navigation** - use the "Open Link" action (Ctrl+O) to browse linked articles within Vicinae (clicking links in the article body opens the browser)
- **Language switcher** - view the same article in a different language
- Open random or featured Wikipedia pages in the browser
- Copy article URL, title, summary, or full contents

## Commands

| Command | Description |
|---------|-------------|
| Search Page | Search Wikipedia articles by title |
| Open Page | Open a specific Wikipedia page by title |
| Random Page | Open a random Wikipedia page in the browser |
| Featured Page | Open today's featured Wikipedia page in the browser |

## Preferences

### View Type

Choose between list and grid view for search results:

- List (default)
- Grid

## How to Use

1. Install the extension
2. Run the "Search Page" command
3. Type to search for articles
4. Select an article to view its full content
5. Use the language dropdown to switch languages
6. Use "Open Link" (Ctrl+O) in the action panel to navigate to linked articles

## Development

```bash
npm install
npm run dev
```

To build:

```bash
npm run build
```

To lint:

```bash
npm run lint
```
