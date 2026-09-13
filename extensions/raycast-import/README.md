# Vicinae Raycast Import

Import data exported from the official Raycast app into [Vicinae](https://github.com/vicinaehq/vicinae).

> Store listing name: **raycast-import** — in the Vicinae extension store this extension appears as "Import Raycast Data".

**Currently: snippets + clipboard history (text/links) + emoji history.** Reads either:
- a **plain `.json`** from Raycast's **"Export Snippets"** command (unencrypted), or
- an encrypted **`.rayconfig`** backup from **"Export Settings & Data"** — decrypted
  **locally in the extension** with the passphrase you supply (nothing transmitted).

## What it does

- `Import Raycast Data` command → pick the export file (+ passphrase for `.rayconfig`)
- **Snippets:** converts Raycast snippets to Vicinae's native `SerializedSnippet` shape
  and merges into `<dataDir>/snippets/snippets.json`. Merge mode (default) or full
  replace (checkbox); duplicates skipped by name/keyword. Handles v1 (`name`+`alias`)
  and v2 (`title` + `rawContent` rich-text doc) snippet shapes.
- **Clipboard history** (`.rayconfig` only, checkbox): replays text + link entries from
  the export through the app's **own clipboard recorder** —
  `Clipboard.copy(text)` → macOS pasteboard → Vicinae's `poll()` observes it →
  dedupe by content hash (`tryBubbleUpSelection`) → inserts into its SQLite store.
  Because the app does the writing, **encryption is transparent** (no "disable
  encrypt sensitive data" dance), and imported entries get full fuzzy-search
  indexing. Runs at ~1.7 entries/sec (macOS clipboard poll tick = 500ms), with a
  progress toast. Images/files are skipped (no body in the Raycast export).
- **Emoji history** (checkbox): imports Raycast emoji frecency + custom keywords as
  metadata into Vicinae's `<dataDir>/emojis/emojis.json` (`GlyphService` store —
  visitCount/keyword), so your frequently-used emoji rank first again. The glyph
  table itself is built into Vicinae; only metadata is imported.
- Atomic write (tmp + rename) for both stores, with a `.bak-<ts>` backup of the
  previous store.

## Clipboard history & encryption

Vicinae on macOS enables **"Encrypt sensitive data"** by default, making `clipboard.db`
SQLCipher-encrypted. That does **not** block this import: the importer copies each
entry onto the system clipboard and lets **Vicinae itself** observe and record it
(the app holds the decryption key in-process). No settings changes needed, and
imported entries end up just as searchable as clipboard entries you copy yourself.

## Why the `.rayconfig` passphrase

Raycast encrypts "Export All Data" backups with a passphrase (≥8 chars) even when you
never set one — it generates it and stores it in the login keychain. Find/view it at:
**Raycast → Settings → Extensions → Export Settings & Data**. The `.rayconfig`
formats are reverse-engineered (Tinycast) and verified live here:

| Format | File layout | Key |
|---|---|---|
| v1 (Raycast 1.x) | `IV(16) + AES-256-CBC(gzip(JSON), PKCS#7)` | `SHA-256(passphrase)` |
| v2 (Raycast X, schema v3) | `"RAYCFG3\n" + u32le(gzipLen) + gzip(envelope{encryption:{iv,salt}}) + AES-256-GCM(tag-appended)` | `scrypt(pw, salt, N=16384, r=8, p=1)` |

Detection is by leading bytes (gzip magic `1f 8b 08` or `RAYC` magic ⇒ v2, else v1),
no passphrase needed to detect. A wrong passphrase is reported as "Incorrect
passphrase" and never touches the store.

## Dev

```bash
npm install
npx vici build --out "$HOME/.local/share/vicinae/extensions/raycast-import"
```

## Restart caveat (VERIFIED in source)

`SnippetDatabase` loads snippets once at construction and rewrites the file on every
mutation — no file watcher. After an import, **quit and reopen Vicinae** before
editing snippets, or the running instance may write back its stale in-memory list
over your import.
