# Flathub Search

Search and browse Flatpak applications from Flathub directly in Vicinae.

## Features

- **Real-time search**: Search the Flathub catalog as you type
- **Popular apps**: Browse the most-installed applications before searching
- **App details**: Toggle a detail panel with screenshots, description, developer, version, and install count
- **Install**: Launch GNOME Software or KDE Discover to install the selected app (requires a Flatpak-capable desktop)
- **Persistent cache**: Results are cached across sessions (24-hour TTL) so the popular list loads instantly on repeat opens

## Actions

| Action               | Shortcut | Description                                                                        |
| -------------------- | -------- | ---------------------------------------------------------------------------------- |
| Toggle Detail        | `⌘D`     | Show/hide the app detail panel                                                     |
| Install              | `⌃I`     | Open the app in your system's Flatpak installer                                    |
| Open on Flathub      | `⌃O`     | Open the app page in your browser                                                  |
| Copy App ID          | `⌃.`     | Copy the Flatpak app ID (e.g. `org.mozilla.firefox`)                               |
| Copy Install Command | `⌃⇧.`    | Copy the full install command (e.g. `flatpak install flathub org.mozilla.firefox`) |

> **Install** is only shown when a Flatpak-capable handler is registered for the `flatpak+https` URI scheme.

## Development

```sh
npm install
npm run dev
```

To build the production bundle:

```sh
npm run build
```
