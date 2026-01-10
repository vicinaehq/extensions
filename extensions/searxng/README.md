# Searxng Integration

A [Vicinae](https://github.com/vicinaehq/vicinae) extension for searching with a searxng instance.

## Features
- **Search** with your custom Searxng Instance
- **Automatic** pagination
- **Details** about search results, such as previews or thumbnails if available.

## Setup

When initially starting the extensions, you will be asked, what instance you want to use. That instance **needs** to have
enabled JSON as search format. See the [searxng documentation](https://docs.searxng.org/admin/settings/settings_search.html#settings-search) 
for how to do it.

If you use a public instance, you need to make sure, that instance allows JSON to be used.
You can easily do this, by using the path `/search?q=hello&format=json` right after the domain in your browser.
If you get a `Forbidden`-page, this instance cannot be used.

## Keybinds
- <kbd>Enter</kbd> - Open the link in the primary browser
- <kbd>Ctrl + Space</kbd> - Toggle detail view