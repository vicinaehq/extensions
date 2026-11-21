// Headless background importer (no-view command) — the ONLY long-running worker.
//
// Launched by the view command ("Import Raycast Data") via launchCommand with a
// launchContext of { dir, key }: the path + AES-256-GCM key of an encrypted,
// unpredictable temp payload written by writeSecretPayload(). The payload is:
//   { clipboard?: ClipboardRecord[], extensions?: ExtensionPick[] }
// This one worker runs BOTH the clipboard-history stream (through Vicinae's own
// recorder) and the extension self-install (official Raycast store backend),
// so the view only ever does ONE launchCommand handoff.
//
// Security (SECURITY-003): the encrypted payload is read once, the temp dir is
// deleted in a finally on EVERY exit path (missing context, read failure, empty
// payload, success, error), and a stale sweep clears leftovers from interrupted
// runs. The passphrase never crosses the launch boundary — only decrypted
// records, already encrypted again under the ephemeral key.
//
// Why no-view: a view command's worker dies with its CommandFrame (window
// dismissed); this command has no window, and the RDK awaits
// module.default.default(props) so the worker survives until it finishes.

import { readSecretPayload, deleteSecretPayload, cleanupStaleSecrets, type SecretPayload } from "./lib/secure-tmp";
import { importClipboardRecords, type ClipboardRecord } from "./lib/clipboard-import";
import { installExtensions, type ExtensionPick } from "./lib/extensions-install";
import { Toast, showToast, type LaunchProps } from "@vicinae/api";

interface BackgroundPayload {
	clipboard?: ClipboardRecord[];
	extensions?: ExtensionPick[];
}

export default async function Command(props: LaunchProps): Promise<void> {
	cleanupStaleSecrets(); // clear leftovers from any interrupted prior run

	const dir = props.launchContext?.["dir"];
	const key = props.launchContext?.["key"];
	const payloadRef: SecretPayload | null =
		typeof dir === "string" && dir && typeof key === "string" && key ? { dir, key } : null;

	if (!payloadRef) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Import can't start",
			message: "No background payload received (launch context missing).",
		});
		return;
	}

	// read payload (throws on decrypt/parse failure) — delete the dir on ANY exit
	let payload: BackgroundPayload;
	try {
		payload = readSecretPayload<BackgroundPayload>(payloadRef);
	} catch (err) {
		deleteSecretPayload(payloadRef);
		await showToast({
			style: Toast.Style.Failure,
			title: "Import can't start",
			message: `Couldn't read the prepared import payload: ${err instanceof Error ? err.message : String(err)}`,
		});
		return;
	}

	let clipboardCount = 0;
	let extInstalled = 0;
	let extSkipped = 0;
	let extFailed = 0;

	try {
		// extensions first (fast, per-extension), then the long clipboard stream
		if (payload.extensions && payload.extensions.length > 0) {
			const toast = await showToast({
				style: Toast.Style.Animated,
				title: "Installing Raycast extensions…",
				message: `0/${payload.extensions.length} done`,
			});
			const report = await installExtensions(payload.extensions, (done, total, installed, skipped, failed) => {
				toast.message = `${done}/${total} — ${installed} installed, ${skipped} already present, ${failed} failed`;
			});
			extInstalled = report.installed;
			extSkipped = report.skipped;
			extFailed = report.failures.length;
			if (extFailed === 0) {
				toast.style = Toast.Style.Success;
				toast.title = "Extensions installed";
				toast.message = `${extInstalled} installed${extSkipped ? `, ${extSkipped} already present` : ""}`;
			} else {
				toast.style = Toast.Style.Failure;
				toast.title = `Extensions finished with ${extFailed} failure${extFailed > 1 ? "s" : ""}`;
				toast.message = `${extInstalled} installed, ${extSkipped} skipped. First: ${report.failures[0].name} — ${report.failures[0].error}`;
			}
		}

		if (payload.clipboard && payload.clipboard.length > 0) {
			const result = await importClipboardRecords(payload.clipboard);
			clipboardCount = result.imported;
		}
	} catch (err) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Background import failed",
			message: err instanceof Error ? err.message : String(err),
		});
	} finally {
		deleteSecretPayload(payloadRef);
	}

	if (clipboardCount > 0) {
		console.log(
			`[raycast-import] background done: clipboard=${clipboardCount} extensions=+${extInstalled} (${extFailed} failed, ${extSkipped} skipped)`,
		);
	}
}
