import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Clipboard, closeMainWindow } from "@vicinae/api";
import { prefs } from "./oath-session";

const VICINAE_DIR = join(homedir(), ".local", "share", "vicinae");
const CLIPBOARD_DB = join(VICINAE_DIR, "clipboard.db");
const CLIPBOARD_DATA = join(VICINAE_DIR, "clipboard-data");

/** Vicinae writes the selection asynchronously; we give it a few chances to show up. */
const PURGE_ATTEMPTS = 8;
const PURGE_INTERVAL_MS = 120;

/** We only delete entries created just now, so an older one with the same text survives. */
const RECENT_WINDOW_S = 15;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Outcome of a purge attempt. `absent` means there was no entry to remove in the first place. */
export type PurgeResult = "removed" | "absent" | "failed";

/**
 * Removes the entry matching `text` from Vicinae's clipboard history.
 *
 * This exists because `Clipboard.paste()` does not take the `concealed` flag that `copy()`
 * does: pasting a TOTP writes it to clipboard.db and to the FTS index, in plain searchable text.
 *
 * Matching is by md5 of the content (that is how Vicinae indexes it: `selection.hash_md5`), so
 * the code itself is never written into SQL nor passed through another process's argv.
 *
 * This touches another program's internal database. If the schema changes in a Vicinae update,
 * the function warns and reports `failed`: it never lets the exception escape and break the
 * paste, which is what the user actually asked for.
 */
export async function purgeFromHistory(text: string): Promise<PurgeResult> {
  if (!text) return "absent";

  const hash = createHash("md5").update(text).digest("hex");

  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch {
    console.warn("[clipboard] node:sqlite unavailable; the code stays in Vicinae's history");
    return "failed";
  }

  for (let attempt = 0; attempt < PURGE_ATTEMPTS; attempt++) {
    try {
      const db = new sqlite.DatabaseSync(CLIPBOARD_DB, { timeout: 2000 });
      try {
        // Without this, data_offer's ON DELETE CASCADE does not run.
        db.exec("PRAGMA foreign_keys = ON");

        const cutoff = Math.floor(Date.now() / 1000) - RECENT_WINDOW_S;

        const offers = db
          .prepare(
            `SELECT d.id AS offerId
               FROM data_offer d
               JOIN selection s ON s.id = d.selection_id
              WHERE s.hash_md5 = ? AND s.created_at >= ?`,
          )
          .all(hash, cutoff) as { offerId: string }[];

        if (offers.length === 0) {
          db.close();
          await sleep(PURGE_INTERVAL_MS);
          continue;
        }

        // The `selection_ad` trigger cleans selection_fts, and the CASCADE cleans data_offer.
        const result = db
          .prepare("DELETE FROM selection WHERE hash_md5 = ? AND created_at >= ?")
          .run(hash, cutoff);

        db.close();

        // The content itself lives in a file named after the data_offer id. The database row
        // going away is not enough: while that file is there, the code is still on disk in
        // plain text, so a failure here is a failed purge and has to be reported as one.
        let blobsGone = true;
        for (const { offerId } of offers) {
          try {
            rmSync(join(CLIPBOARD_DATA, offerId), { force: true });
          } catch (err) {
            blobsGone = false;
            console.warn(`[clipboard] could not remove blob ${offerId}: ${String(err)}`);
          }
        }

        return Number(result.changes) > 0 && blobsGone ? "removed" : "failed";
      } catch (err) {
        db.close();
        throw err;
      }
    } catch (err) {
      console.warn(`[clipboard] purge failed: ${String(err)}`);
      return "failed";
    }
  }

  // The entry never showed up. The likely reason is that Vicinae deduplicated it (it ignores a
  // selection identical to the current one), so there is nothing to remove and nothing to warn
  // about. A schema change would land here too, but it would also have thrown above in every
  // realistic case, and warning on every deduplicated paste would train the user to ignore it.
  return "absent";
}

/** What happened to the pasted code's clipboard-history entry. */
export type PasteOutcome = "purged" | "kept-by-preference" | "purge-failed";

/**
 * Pastes into the field that was focused and, if the user wants it, erases the history trail.
 *
 * Order matters: `closeMainWindow()` comes BEFORE `paste()`. That is what Vicinae itself does
 * in the native `Action.Paste`: the window has to get out of the way so the compositor gives
 * focus back to the previous window before the keystroke is injected.
 *
 * Returns the outcome instead of swallowing it: a purge that silently fails leaves the code in
 * plain text in the history while the user believes the protection they enabled worked.
 */
export async function pasteAndForget(text: string): Promise<PasteOutcome> {
  await closeMainWindow();
  await Clipboard.paste(text);

  if (prefs().purgeClipboardHistory === false) return "kept-by-preference";
  return (await purgeFromHistory(text)) === "failed" ? "purge-failed" : "purged";
}

/** Copies without leaving a history trail. Plan B when the paste lands in the wrong window. */
export async function copyConcealed(text: string): Promise<void> {
  await Clipboard.copy(text, { concealed: true });
}
