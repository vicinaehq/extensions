// Shared clipboard-history import routine.
// Streams clipboard records through Vicinae's OWN recorder via Clipboard.copy()
// (encryption-transparent, dedup via tryBubbleUpSelection, fuzzy_search indexed).
// Extracted so both the old view fallback and the headless background worker use
// ONE implementation. See README for the verified recorder mechanics.

import { Clipboard, Toast, showToast } from "@vicinae/api";

export type ClipboardRecord = {
	text: string;
	category: string;
	applicationPath?: string;
};

export type ClipboardImportResult = {
	status: "ok";
	imported: number;
	skippedDupes: number;
	skippedImagesFiles: number;
	skippedEmpty: number;
	errors: { byteLen: number; error: string }[];
};

const CLIPBOARD_COPY_INTERVAL_MS = 600;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Import clipboard records into Vicinae history by replaying them through the
 *  recorder. Returns counts; never throws — per-record errors are collected and
 *  reported so a single failed RPC can't kill the whole stream. */
export async function importClipboardRecords(records: ClipboardRecord[]): Promise<ClipboardImportResult> {
	let imported = 0;
	let skippedDupes = 0;
	let skippedImagesFiles = 0;
	let skippedEmpty = 0;
	let clipboardErrors: { byteLen: number; error: string }[] | null = null;

	let toast: Toast | null = null;
	try {
		toast = await showToast({
			style: Toast.Style.Animated,
			title: "Importing clipboard history…",
			message: "0% — copying entries through Vicinae's recorder",
		});
	} catch {
		toast = null;
	}

	const total = records.length;
	let lastReport = Date.now();

	try {
		for (const r of records) {
			if (r.category !== "text" && r.category !== "link") {
				skippedImagesFiles++;
				continue;
			}
			const text = (r.text ?? "").toString();
			if (!text) {
				skippedEmpty++;
				continue;
			}
			// concealed=false (default): the copy is observed and recorded into history.
			// Re-copying identical text bubbles to the top instead of duplicating.
			// One failed copy must NEVER kill the import: catch per record, remember,
			// keep streaming, report at the end.
			try {
				await Clipboard.copy(text);
				imported++;
			} catch (err) {
				if (!clipboardErrors) clipboardErrors = [];
				clipboardErrors.push({
					byteLen: Buffer.byteLength(text, "utf8"),
					error: err instanceof Error ? err.message : String(err),
				});
			}
			// one pasteboard change per poll tick (500ms) — leave margin
			await sleep(CLIPBOARD_COPY_INTERVAL_MS);

			// throttle toast updates to ~2/sec
			const now = Date.now();
			if (toast && now - lastReport > 500) {
				lastReport = now;
				const pct = Math.round((imported / total) * 100);
				toast.message = `${pct}% — ${imported}/${total} copied, ${clipboardErrors ? clipboardErrors.length : 0} failed (runs at ~1.7/sec)`;
			}
		}
	} catch {
		// defensive: never throw out of the importer
	}

	if (toast) {
		toast.style = Toast.Style.Success;
		toast.title = "Clipboard history imported";
		toast.message = `${imported} entries copied into Vicinae's history${
			clipboardErrors && clipboardErrors.length > 0 ? `, ${clipboardErrors.length} failed` : ""
		}.`;
	}

	return {
		status: "ok",
		imported,
		skippedDupes,
		skippedImagesFiles,
		skippedEmpty,
		errors: clipboardErrors ?? [],
	};
}
