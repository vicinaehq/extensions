<p align="center">
  <img src="assets/extension_icon.png" alt="Jackett Search Icon" width="96" />
</p>

# Jackett Search

Search torrents across multiple trackers directly from Vicinae using Jackett API. Jackett acts as a single repository of maintained indexer scraping & translation logic, removing the burden from other apps.

## Requirements

- [Jackett](https://github.com/Jackett/Jackett) running and accessible
- Jackett API key (available in Jackett web UI under Configuration > API Key)
- At least one indexer configured in Jackett

## Commands

| Command | Description |
| --- | --- |
| `Search Torrents` | Search torrents using Jackett API with advanced filtering and sorting options. |

## Preferences

- **Jackett URL** – Full URL to your Jackett server (defaults to `http://127.0.0.1:9117`).
- **API Key** – Jackett API key for authentication.
- **Sort By** – Default sort order for search results: `Seeders`, `Peers`, `Size`, or `Date`.
- **Minimum Seeders** – Only show torrents with at least this many seeders (defaults to `0`).
- **Categories** – Filter by categories (comma-separated, e.g., `2000,3000` for Movies and Audio).
- **Trackers** – List of tracker names to search (comma-separated). Leave as "all" to search all configured trackers.
- **Default Action** – Action to perform when selecting a torrent: `Open Magnet Link` or `Download Torrent File`.

## Quick Start with Docker Compose

The fastest way to get Jackett running is using Docker Compose:

**docker-compose.yml:**

```yaml
services:
  jackett:
    image: lscr.io/linuxserver/jackett:latest
    container_name: jackett
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/London
      - AUTO_UPDATE=true
    volumes:
      - ./config:/config
      - ./downloads:/downloads
    ports:
      - 9117:9117
    restart: unless-stopped
```

**Steps:**

1. Save the above configuration as `docker-compose.yml` in a new directory.
2. Run `docker-compose up -d` to start Jackett.
3. Open `http://localhost:9117` in your browser to access the Jackett web UI.
4. Navigate to Configuration > API Key and copy your API key.
5. Configure indexers (trackers) in Jackett by clicking "Add Indexer".
6. In Vicinae, configure the Jackett Search extension with your URL and API key.

## Usage

1. Run the `Search Torrents` command in Vicinae.
2. Enter a search query (at least 3 characters) to start searching.
3. Use the dropdown menu to filter results:
   - **By seeders** – Sort by number of seeders (descending)
   - **By peers** – Sort by number of peers (descending)
   - **By size** – Sort by file size (descending)
   - **By date** – Sort by publish date (newest first)
4. Select a torrent to view details:
   - **Show Details** – View comprehensive information about the torrent
   - **Open Magnet** – Open magnet link with default torrent client
   - **Copy Magnet** – Copy magnet link to clipboard
   - **Download Torrent File** – Download `.torrent` file directly
   - **Open in Browser** – Open torrent details page in browser
5. Use keyboard shortcuts for faster navigation:
   - `Cmd + D` – Show torrent details
   - `Cmd + C` – Copy magnet link
   - `Cmd + R` – Refresh results

## Development

```bash
git clone <this-repo>
cd <this-repo>
npm install
npm run dev
```

Use `npm run build` to assemble a production bundle that Vicinae can import.

## Troubleshooting

- **No results found**: Make sure at least one indexer is configured in Jackett and tested successfully.
- **Configuration Required error**: Verify your Jackett URL and API key in extension preferences.
- **Failed to open magnet link**: Ensure you have a default torrent client installed that supports magnet links (e.g., qBittorrent, Transmission).
- **Connection errors**: Check that Jackett is running and accessible at the configured URL.
- **Indexer not working**: Test individual indexers in Jackett web UI under Configuration > Indexers.

## License

MIT
