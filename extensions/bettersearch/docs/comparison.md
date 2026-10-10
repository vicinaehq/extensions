# BetterSearch compared with the alternatives

This page makes the case for BetterSearch. It also says where another tool is the better choice.

## Summary

| | BetterSearch | Vicinae built-in file search | fd / ripgrep based extensions | Recoll |
| --- | --- | --- | --- | --- |
| File name search | Yes | Yes | Yes | Yes |
| Search inside files | Yes, text files | No | Yes, with ripgrep | Yes, including PDFs and office documents |
| Typo tolerance | Yes | Yes | No | No (word stemming only) |
| Ranking | Match quality, recent changes, query history | Match quality | None (walk order) | Relevance |
| Latency per keystroke | ~3 ms names, ~5 ms contents | Not measured in the app (see below) | ~15 ms names, ~180 ms contents | Index lookup |
| Live updates | File watcher | Incremental indexer (Linux) | Rescans on every query | Periodic reindex |
| Git status in results | Yes | No | No | No |
| Indexes hidden and gitignored files | No, outside folders you add | Yes | Optional | Configurable |
| Open editor at matching line | Yes | No | Depends on the extension | No |
| Platforms | Linux, macOS, Windows | Linux (own indexer), macOS (Spotlight) | Any with the binaries installed | Linux, macOS, Windows |

## Measurements

Measured on an AMD Ryzen 7 5700X with a SATA SSD, CachyOS, searching a home folder with 38,433 files (as counted by `fd`). Each value is the median of repeated runs, with the index warm.

### File name search

| Query | BetterSearch | Top BetterSearch result | Vicinae built-in | `fd -i -p` |
| --- | --- | --- | --- | --- |
| `search contents` | 3.1 ms | `…/src/search-file-contents.tsx` | 4 hits, the same file second | 13.8 ms, 1 unranked hit |
| `serch contnts` (2 typos) | 2.9 ms | `…/src/search-file-contents.tsx` | 4 hits, the same file second | 13.5 ms, 0 hits |
| `daemon mjs` | 2.4 ms | `…/scripts/install-daemon.mjs` | 3 hits | 14.7 ms, 2 hits |
| `vicnae fff extnsion` (2 typos) | 2.6 ms | `vicinae-fff-extension/` | 42 hits, the same folder first | 14.4 ms, 0 hits |

For `fd`, the query words were joined into the regex `word1.*word2`. The built-in results come from `vicinae fs query`. In the two `search contents` queries, the built-in's first hit was the copy of the file inside the installed extension, a folder BetterSearch does not index because it is hidden.

### Content search

| Query | BetterSearch | ripgrep (`rg -n`) | Same matches |
| --- | --- | --- | --- |
| `autowrap_mode` | 5.4 ms | 191.5 ms | Yes (15) |
| `requireRoots` | 5.1 ms | 176.4 ms | Yes (3) |
| `zzqqxxnotfound` (no match) | 2.9 ms | 185.7 ms | Yes (0) |

ripgrep is the fastest tool for a single search. It loses here because a launcher repeats the search on every keystroke, and each ripgrep run walks the whole folder again. fff walks the folder once, keeps the file list and a content index in memory, and keeps both current with a file watcher.

### What was not measured

The built-in search's latency inside the launcher. `vicinae fs query` took about 15 ms per query, but that includes starting the CLI process, which the launcher does not do, so the number is not comparable.

## The alternatives in detail

### Vicinae's built-in file search

**Use it when** you only search by file name, or need to find hidden files and config such as `~/.zshrc` without extra setup.

It is a good file name search. It handled every typo test above and ranks results sensibly. The differences:

- **It cannot search inside files.** This is the main reason to use BetterSearch.
- **It indexes everything.** It finds hidden files (`~/.zshrc`) and gitignored files that BetterSearch skips. That is useful for config files, but on the test machine it reported over 300,000 indexed files against 5,300 for BetterSearch, so app data and caches compete with your own files.
- **No git status, no editor line jumps, no learning from what you open.**
- **It can appear in the main search bar**, which extensions cannot (set `search_files_in_root`).
- On macOS it uses Spotlight.

BetterSearch does not replace it. Extensions cannot change Vicinae's built-in search or add results to the main search bar. Both can be installed side by side.

### fd or ripgrep based extensions

**Use them when** you need exact regex searches over files that BetterSearch skips, such as gitignored build output.

- They start a new process on every keystroke and walk the folder each time. That costs about 15 ms per file name search and about 180 ms per content search in the measurements above, and grows with the folder.
- They return results in walk order, with no ranking.
- They have no typo tolerance.

### Recoll, plocate and other desktop indexers

**Use Recoll when** you need to search inside PDFs, office documents or email. BetterSearch does not do that.

- `plocate` and `locate` are very fast name lookups, but the database is rebuilt on a schedule, so new files are missing until the next update. They have no typo tolerance and no content search.
- Recoll extracts text from documents, which BetterSearch cannot do. It is a separate application with its own interface, not part of the launcher.

## Limitations of BetterSearch

- **Text files only for content search.** PDFs, office documents and binary files are found by name but not searched inside. Files over 10 MB are skipped.
- **Hidden folders are skipped outside git repositories.** Add a hidden folder like `~/.config` to Indexed Directories to include it.
- **Memory.** The background process keeps the file list and a content index in memory. On the test machine it used about 250 MB including memory-mapped files.
- **Opening a file only improves ranking for the same query.** fff's Node API does not expose its general "recently opened" tracking, so BetterSearch uses query history instead. Files you modified recently still rank first.
- **Not in the main search bar.** Use it as a fallback command or bind a global shortcut, as described in the [README](../README.md#searching-from-the-main-search-bar).
