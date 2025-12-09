# Simple Bookmarks

A Vicinae extension for keeping your most-used links one keystroke away. Add,
search, open, copy, edit, and delete bookmarks without leaving Vicinae.

## Features

- Quick add with title and URL
- Search-as-you-type filtering in the list view
- Open in browser or copy URL to clipboard
- Edit existing entries or delete with confirmation
- Data persisted locally via Vicinae `LocalStorage`

## Getting Started

Install dependencies and start the extension in development mode:

```bash
npm install
npm run dev
```

Additional scripts:

- `npm run lint` — run Vicinae linting
- `npm run format` — format `src` with Biome

## Using the Extension

1. Launch the `Simple Bookmarks` command from Vicinae.
2. Use the “Add New Link” item to create a bookmark.
3. Type in the search bar to filter by title or URL.
4. For each link, the action panel lets you open in browser, copy the URL,
   edit the entry, or delete it (with a confirmation prompt).

## Data Storage

Bookmarks are stored locally under the `simple-bookmarks` key via Vicinae
`LocalStorage`. Clearing extension data will reset the list.

## Project Structure

- `src/simple-bookmarks.tsx` — main command and list UI
- `src/components/AddLinkForm.tsx` — form to add bookmarks
- `src/components/EditLinkForm.tsx` — edit existing bookmarks
- `src/utils/storage.ts` — load/save helpers backed by `LocalStorage`

## License

MIT
