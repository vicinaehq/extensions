# vicinae-snippets

[中文](README.zh-CN.md)

A Vicinae extension to create, manage, and quickly insert text/code snippets (interaction inspired by Raycast Snippets).

## Highlights

- Create & manage snippets (Name, Snippet content, Category, Keyword)
- Search with preview (Category filter)
- One-keystroke copy/paste into the active app (paste may fall back to copy)
- Dynamic placeholders (subset compatible with Raycast Dynamic Placeholders)
- Import/export (JSON file preferred, clipboard fallback)

## Commands

- **Create Snippet**: create a new snippet
- **Search Snippets**: search/preview and copy/paste/edit/duplicate/pin snippets
- **Import Snippets**: import from JSON (file first) and show an import report
- **Export Snippets**: export to a JSON file and also copy JSON to clipboard

## Usage

### Create Snippet

Form fields (same order as Edit):

- **Name**
- **Snippet**
- **Keyword**
- **Category**

> Note: Raycast keywords can auto-expand globally. In this extension, **Keyword is only used for Vicinae search** (alias/filter). No global auto-expansion.

### Search Snippets

- **Right panel**:
  - Top: full snippet content (preserves newlines and leading indentation)
  - Bottom fields (top-to-bottom): Name / Category / Content type / Modified

- **Action shortcuts (bottom-right)**:
  - Paste to Active App: `Enter`
  - Copy to Clipboard: `Ctrl+Enter`
  - Pin Snippet: `Ctrl+Shift+P`
  - Edit Snippet: `Ctrl+E`
  - Duplicate Snippet: none
  - Move to Other Category: none (updates the snippet Category)

## Dynamic placeholders (v1)

- `{clipboard}`: insert clipboard text; if empty, replaces with empty string and shows a notice
- `{selection}`: insert selected text; if unavailable/empty, replaces with empty string and shows a notice
- `{date}` / `{time}` / `{datetime}` / `{day}`
- `{uuid}`
- `{argument}`: prompts user input (up to 3 distinct arguments; supports `name`/`default`)
- `{cursor}`: parsed and removed (cursor positioning not supported yet; shows a notice)

Modifiers: `uppercase`, `lowercase`, `trim`, `percent-encode`, `json-stringify`, `raw`.

### Not supported (will warn)

- `{snippet name="..."}`
- `{browser-tab}`
- `{clipboard offset=...}` (Vicinae API offset not implemented)

## Import / Export

### Import

- Preferred: pick a JSON file
- Fallback: paste JSON in the form or use clipboard JSON
- Dedupe: same `title + content` is considered a duplicate and will be skipped

Supported input formats (best-effort):

- Raycast import format: array of objects with `name`, `text`, optional `keyword`
- This extension format: array, or `{ "snippets": [...] }` (see `specs/001-vicinae-snippets/contracts/snippet-store.schema.json`)

### Export

- Writes `snippets-export-*.json` to `environment.supportPath`
- Also copies the same JSON to clipboard

## Storage

- Offline by default: stored in `environment.supportPath/snippets.json`
- No upload/sync of snippet contents

## Privacy

- Copy action uses `concealed: true` by default to avoid indexing in Vicinae clipboard history

## Development

### Prerequisites

- Node.js 18+
- npm

### Run

```bash
npm install
npm run dev
```

> Note: `npm run dev` filters a known upstream React warning to keep logs clean. Use `npm run dev:raw` to see unfiltered output.

### Build / lint

```bash
npm run build
npm run lint
npm run check
```

## License

MIT.
