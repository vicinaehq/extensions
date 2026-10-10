# Troubleshooting

Start with **Manage File Index**. It shows each indexed folder's state, the daemon's process ID, and any indexing error. Its actions open the log and restart the index.

The log is `daemon.log` in the extension's support folder:

| Platform | Path |
| --- | --- |
| Linux | `~/.local/share/vicinae/support/bettersearch/daemon.log` |
| macOS and Windows | The `support/bettersearch` folder inside Vicinae's data folder |

## The commands do not appear in Vicinae

The build output goes to Vicinae's extension folder (`~/.local/share/vicinae/extensions/bettersearch` on Linux). Check that the folder exists, then restart Vicinae with `vicinae server --replace`.

## "fff native bindings are missing"

The daemon's dependencies were not installed. Run this in the repository:

```bash
npm install
npm run build
```

If you used `npm install --ignore-scripts` or a package manager that skips `postinstall`, run `node scripts/install-daemon.mjs` yourself.

## "fff has no native library for <platform>"

fff publishes binaries for Linux x64 and arm64 (glibc and musl), macOS x64 and arm64, and Windows x64 and arm64. Other platforms, such as 32-bit ARM or FreeBSD, are not supported.

If you built on one machine and copied the build to another, rebuild with `npm run build:universal`, which includes every platform.

## "fff daemon did not start"

Read `daemon.log`. Common causes:

- **The socket folder is not writable.** On Linux the socket lives in `$XDG_RUNTIME_DIR`, falling back to the system temp folder.
- **The extension folder was moved while a command was open.** Close the command and open it again.

## A file is missing from the results

- **It is hidden, or inside a hidden folder, outside a git repository.** Add the folder to **Indexed Directories** directly.
- **It is gitignored inside a git repository.** fff respects `.gitignore`.
- **It is in a skipped dependency folder**, such as `node_modules` or `.venv`. See the list in the README.
- **It was just created.** The watcher picks up changes within a moment. If it does not, run **Rescan Index**.
- **Content search only:** it is a binary file, a PDF or office document, or larger than 10 MB.

## The editor opens the file but not at the line

Check that the **Editor Command** uses the editor's own syntax for jumping to a line. See the examples in the README. If the command has no `{file}` placeholder, the file path is added at the end.

## Terminal editors open nothing

Turn on **Run editor command in a terminal**. Vicinae then starts your default terminal emulator (on Linux, as defined by `xdg-terminal-exec`).

## High memory use

The daemon keeps the file list and a content index in memory. To reduce it, index fewer or smaller folders. **Manage File Index → Stop Background Index** frees the memory until your next search.

## Reset everything

1. **Manage File Index → Stop Background Index.**
2. Delete the support folder (`~/.local/share/vicinae/support/bettersearch` on Linux).

The next search rebuilds the index from scratch.
