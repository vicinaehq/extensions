// Headless clipboard-history importer (no-view command).
//
// The view command (import-data) decrypts the .rayconfig, imports snippets +
// emoji, then hands the clipboard loop to THIS command via launchCommand:
//   launchCommand({ name: "import-clipboard", type: LaunchType.UserInitiated,
//                   context: { file: <tmp clipboard JSON path> } })
//
// Why a no-view command: a VIEW command's worker dies when its CommandFrame is
// destroyed (window dismissed / navigated away / Escape) — ~CommandFrame() calls
// context->unload() (navigation-controller.hpp). A 6-50 minute clipboard loop
// cannot live in a view window. A no-view command has no window, and the RDK
// (load-no-view-command.ts) awaits module.default.default(props), so the worker
// stays alive for the whole stream. Dedup (tryBubbleUpSelection by content hash)
// makes re-runs idempotent: already-imported entries are just bubbled to top,
// never duplicated, so even an interrupted run is safe to re-run.
//
// The passphrase is deliberately NOT passed here — the view worker writes the
// decrypted clipboard array to a 0600 temp JSON file and passes its path via
// launchContext (in-memory). Clipboard text in the file is the same data Raycast
// already exported; the file is deleted at the end.

import { readFileSync, rmSync } from "node:fs";
import { Clipboard, Toast, environment, showToast, type LaunchProps } from "@vicinae/api";

type ClipboardRecord = { text: string; category: string; applicationPath?: string };

type ClipboardImportResult = {
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

function readRecords(path: string): ClipboardRecord[] {
	const raw = JSON.parse(readFileSync(path, "utf8"));
	if (!Array.isArray(raw)) throw new Error("corrupt");
	return raw as ClipboardRecord[];
}

async function streamImport(records: ClipboardRecord[], tmpPath: string): Promise<ClipboardImportResult> {
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
	} finally {
		// clean up the temp clipboard file no matter what
		try {
			rmSync(tmpPath, { force: true });
		} catch {
			/* best effort */
		}
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

export default async function Command(props: LaunchProps): Promise<void> {
	const file = props.launchContext?.["file"];
	if (typeof file !== "string" || !file) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Clipboard import can't start",
			message: "No import payload received (launch context missing).",
		});
		return;
	}

	let records: ClipboardRecord[];
	try {
		records = readRecords(file);
	} catch {
		await showToast({
			style: Toast.Style.Failure,
			title: "Clipboard import can't start",
			message: `Couldn't read the prepared entries (${file}).`,
		});
		return;
	}

	if (records.length === 0) {
		await showToast({
			style: Toast.Style.Success,
			title: "Clipboard history",
			message: "Nothing to import from this backup.",
		});
		return;
	}

	await streamImport(records, file);
	console.log(
		`[raycast-import] clipboard no-view done: ${records.length} records, launchType=${environment.launchType}`,
	);
}
