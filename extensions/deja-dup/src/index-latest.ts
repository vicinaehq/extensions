import {
  autoIndexEnabled,
  buildFileIndex,
  hasIndex,
  listSnapshots,
  pruneOrphanIndexes,
} from "./lib/deja-dup";

/**
 * Background command (runs on an interval). Always cleans up orphaned indexes, and — when
 * "Automatic Indexing" is enabled — builds the index for the latest snapshot ahead of time,
 * so the first Browse/Search after a new backup is instant instead of downloading the file
 * listing on demand (metadata scales with file count — e.g. ~170 MB for ~1.3M files).
 */
export default async function IndexLatest() {
  try {
    const snaps = await listSnapshots();
    await pruneOrphanIndexes(snaps.map((s) => s.short_id));

    if (!autoIndexEnabled()) return;
    const latest = snaps[0];
    if (!latest || (await hasIndex(latest.short_id))) return;

    await buildFileIndex(latest, () => undefined);
  } catch {
    // Background run: fail silently (e.g. locked keyring, offline). Retried next interval.
  }
}
