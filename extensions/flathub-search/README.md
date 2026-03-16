# Flathub Search

Search for Flatpak applications directly from Vicinae.

## Features

- **Real-time search**: Search the Flathub catalog as you type with TanStack Query caching
- **Popularity sorting**: Search results automatically sorted by number of installs
- **Popular apps**: Browse popular applications before searching
- **Copy App ID**: Quickly copy the application identifier to clipboard (primary action)
- **Install command**: Copy the complete flatpak install command
- **Open on Flathub**: Open the application page in your browser
- **Optimized performance**: Leverages react-query for efficient data fetching and caching

## Usage

1. Launch the extension with the `Flathub Search` command
2. Browse popular apps or type to search for applications
3. View install counts (e.g., "238.7K installs") next to app IDs to gauge popularity
4. Press `Enter` or `?C` to copy the app ID to clipboard
5. Press `?O` to open the app page on Flathub
6. Press `??C` to copy the install command

## Actions

- **Copy App ID** (`?C`): Copies the flatpak application ID (e.g., `org.mozilla.firefox`)
- **Open on Flathub** (`?O`): Opens the application page in your browser
- **Copy Install Command** (`??C`): Copies the full installation command (e.g., `flatpak install flathub org.mozilla.firefox`)

## Technical Details

This extension uses:
- **TanStack Query (React Query)** for efficient API request management
- **Flathub API v2** for search functionality
- **Flathub API v1** for popular applications collection
- **Debounced search** via List throttle prop
- **Smart caching** with 5-10 minute stale times to reduce API calls

## Development

```bash
npm install
npm run dev
```

To build the production bundle:

```bash
npm run build
```
