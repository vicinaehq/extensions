# FD Search (Vicinae Extension)

Fast filesystem search for Vicinae powered by **fd** with fuzzy matching, indexing, and file-type filtering.

## Features

- 🔎 Instant fuzzy search across indexed filesystem paths
- ⚡ Fast indexing using `fd`
- 📁 Open files or parent directories directly
- 🖥️ Open a terminal in selected directories
- 🗂️ Filter results by file type (images, documents, code, video, etc.)
- 📋 Copy file paths or names quickly
- 🔄 Background index updates

## Requirements

- Vicinae installed
- `fd` (or `fdfind`) installed

Install fd:

**Arch Linux**
```bash
sudo pacman -S fd
````

**Debian / Ubuntu**

```bash
sudo apt install fd-find
```

## Installation (Manual)

Clone or copy the extension into the Vicinae extensions directory:

```bash
~/.local/share/vicinae/extensions/
```

Then restart Vicinae.

## Usage

1. Open Vicinae
2. Run **FD Search**
3. Start typing to search files instantly (First run may take a minute to index)
4. Use the dropdown to filter file types
5. Use actions to:

   * Open files
   * Open parent folders
   * Open terminal in directory
   * Copy file paths

## Indexing

The extension builds a filesystem index automatically on first launch
and refreshes periodically in the background.

You can rebuild the index manually using:

**Rebuild Index** action.

## License

MIT
