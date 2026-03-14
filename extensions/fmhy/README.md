# FMHY Raycast Extension

An unofficial [Raycast](https://raycast.com) and [Vicinae](https://github.com/vicinaehq/vicinae) extension to browse and search sites from the [FMHY](https://fmhy.net) (FreeMediaHeckYeah) wiki.

## 🚀 Features

- **Browse FMHY**: Explore all FMHY categories and subcategories in a structured view.
- **Search Across FMHY**: Instantly find specific links or tools across the entire FMHY database.
- **⭐ Recommended Content**: Quickly see curated "Starred" items from each category.
- **Favorites**: Save your most-used links for quick access.
- **Recents**: Track recently visited links within the extension.
- **NSFW Toggle**: Optional content filter for NSFW categories.

## 🔗 Compatibility

This extension is built for **Raycast** but is also fully compatible with [**Vicinae**](https://github.com/vicinaehq/vicinae), the open-source, cross-platform alternative to Raycast for Windows and Linux.

## 🛠️ Commands

- **Browse FMHY**: The main entry point to navigate the wiki structure.
- **Search FMHY**: Search the entire collection of links.
- **FMHY Favorites**: Access your saved items.
- **Recent FMHY Links**: Revisit items you've recently viewed.

## ⚙️ Preferences

You can customize the extension behavior in settings:
- **Cache Duration (Hours)**: Control how long FMHY data is stored locally before refreshing (default: 24h).
- **Show NSFW Content**: Enable or disable visibility of NSFW categories.

## 📦 Installation

### Raycast
1. Open Raycast.
2. Search for "Store".
3. Search for "FMHY" and click "Install".

### Vicinae
1. Download the extension source or use the [Vicinae Extension Store](https://vicinae.net).
2. Follow the [Vicinae guide](https://github.com/vicinaehq/vicinae) for installing local extensions.

## 👨‍💻 Development

To run the extension locally for development:

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Update local cache
npm run update-cache
```

### Platform Configuration

This extension supports both Raycast and Vicinae. The `package.json` can be toggled between configurations using:

```bash
# Check current platform
npm run platform:status

# Switch to Vicinae configuration
npm run platform:vicinae

# Switch to Raycast configuration
npm run platform:raycast
```

After switching platforms, run `npm install` to update dependencies.

| Config | `dependencies` | CLI Commands |
|--------|----------------|--------------|
| Raycast | `@raycast/api` | `ray develop/lint/build` |
| Vicinae | `@vicinae/api` | `vici develop/lint/build` |

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*This extension is not unaffiliated with the official FMHY team but uses their public data.*
