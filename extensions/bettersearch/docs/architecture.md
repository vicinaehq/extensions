# Architecture

## Why there is a background process

Vicinae runs every extension command in a fresh Node.js worker thread and discards it when the command closes. An fff index built inside a command would therefore be rebuilt on every launch, and fff's speed comes from building the index once and keeping it current.

BetterSearch splits into two parts:

| Part | Location | Runs |
| --- | --- | --- |
| Commands | `src/*.tsx`, bundled by `vici build` | Inside Vicinae's worker threads, only while a command is open |
| Daemon | `assets/daemon/daemon.mjs` | As a separate Node process, started on first use |

```
Vicinae extension manager (Node)
 ├─ worker: Search Files ─────────┐
 ├─ worker: Search File Contents ─┼── JSON lines over a Unix socket / named pipe ──> daemon.mjs
 └─ worker: Manage File Index ────┘                                                  └─ @ff-labs/fff-node ─ libfff_c (native)
```

## The daemon

`daemon.mjs` is plain JavaScript with one dependency, `@ff-labs/fff-node`. That package loads fff's native library (`libfff_c`) through `ffi-rs`. Both native parts come as prebuilt binaries from npm, so nothing is compiled on your machine.

The daemon is started with the Node binary that runs Vicinae's extensions (`process.execPath`), so no system Node is needed at runtime.

### Socket

| Platform | Address |
| --- | --- |
| Linux | `$XDG_RUNTIME_DIR/vicinae-bettersearch-<uid>.sock` |
| macOS | `$TMPDIR/vicinae-bettersearch-<uid>.sock` |
| Windows | `\\.\pipe\vicinae-bettersearch-<username>` |

### Protocol

Each request is one line of JSON, and each response is one line of JSON:

```json
{"id": 1, "method": "search", "params": {"query": "readme", "pageSize": 50}}
{"id": 1, "ok": true, "value": {"items": [...], "hasMore": true, "scanning": false}}
```

| Method | Params | Returns |
| --- | --- | --- |
| `ping`, `status` | none | Build hash, script path, pid, platform, and per-folder scan state |
| `configure` | `roots`, `followSymlinks`, `dataDir`, `owners` | Status. Rebuilds the indexes only if the settings changed. |
| `search` | `query`, `page`, `pageSize` | Files and folders, merged across indexed folders by score |
| `grep` | `query`, `mode` (`plain`, `regex`, `fuzzy`), `cursor`, `pageSize` | Matches with context lines, plus a cursor for the next page |
| `track` | `query`, `path` | Records that `path` was opened for `query`, for ranking |
| `rescan` | none | Starts a rescan of every indexed folder |
| `shutdown` | none | Exits the daemon |

Errors come back as `{"id": 1, "ok": false, "error": "message"}`.

### Lifecycle

1. A command calls `ensureDaemon()` in `src/lib/daemon.ts`, which pings the socket.
2. If nothing answers, it starts the daemon detached, with its output appended to `daemon.log`, and waits up to 8 seconds for it to answer.
3. If the daemon that answers came from a different install path or a different build (compared by a SHA-1 hash of `daemon.mjs`), it is shut down and replaced. A rebuilt extension never talks to stale code.
4. The command sends `configure` with the current preferences and two process IDs. Because commands run in worker threads, its own process ID is the Vicinae extension manager's, and its parent's is the Vicinae server's.

The daemon exits when:

- the Vicinae server or extension manager that configured it is gone (checked every 10 seconds). Both are watched because the extension manager can outlive the server, for example when a systemd unit with `KillMode=process` stops Vicinae,
- its script is deleted, because the extension was removed (checked every 10 seconds),
- it receives `shutdown`, SIGINT or SIGTERM.

If two commands start a daemon at the same time, the second one finds the socket in use, confirms that the first one answers, and exits. A socket file left behind by a crashed daemon is detected because nothing answers on it, and is replaced.

### Multiple folders

Each folder in **Indexed Directories** gets its own fff instance and its own history database under `<support>/db/<sha1 of path>/`.

- **File search** asks every instance, merges the results by fff's score, and drops duplicates when folders overlap.
- **Content search** searches the folders in order. Its cursor records which folder it is in and fff's position within that folder, so paging continues across folder boundaries.

### Failure handling

- If fff has no native library for the platform, the daemon still starts and answers every request with an error naming the platform, which the commands show in their empty state.
- If a folder cannot be indexed, the others still work, and the error appears in **Manage File Index**.
- If no folder can be indexed, searches return that error instead of empty results.

## The commands

| File | Purpose |
| --- | --- |
| `src/search-files.tsx` | File search UI. Previews are loaded only for the selected item. |
| `src/search-file-contents.tsx` | Content search UI. Groups matches by file, and keeps the match visible in long lines. |
| `src/manage-index.tsx` | Index status, refreshed every second. |
| `src/lib/daemon.ts` | Socket client, daemon start-up and replacement. |
| `src/lib/use-paged-search.ts` | Search state: drops out-of-date responses, retries while the index is still scanning, and loads more pages. |
| `src/lib/actions.tsx` | Shared action panel. |
| `src/lib/open.ts` | Default app, editor command and terminal handling for each platform. |
| `src/lib/preview.ts` | Preview markdown for text, images and folders. |

## Native binaries and builds

`scripts/install-daemon.mjs` runs as the package's `postinstall` step:

- **Default:** `npm ci` in `assets/daemon/`, so npm installs only the binaries for the current machine.
- **All platforms** (with `--all-platforms` as used by `npm run build:universal`, when `CI=true`, or with `BETTERSEARCH_ALL_PLATFORMS=1`): also downloads the binaries for the other seven platforms with `npm pack`, checks each against the integrity hash in `assets/daemon/package-lock.json`, and unpacks them. The result is one bundle that runs anywhere fff is supported.

`vici build` copies `assets/` unchanged, so the daemon and its `node_modules` ship with the extension.
