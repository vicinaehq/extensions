import { Clipboard } from "@vicinae/api";
import { pushClipboard } from "./lib/client";
import { performOnTarget } from "./lib/devices/act";

const PREVIEW_LIMIT = 60;

/**
 * The daemon reads the real system clipboard itself, so this preview is purely
 * cosmetic — a failure to read it must never block the send.
 */
async function clipboardPreview(): Promise<string | undefined> {
	try {
		const text = await Clipboard.readText();
		const collapsed = text?.replace(/\s+/g, " ").trim();
		if (!collapsed) return undefined;
		return collapsed.length > PREVIEW_LIMIT
			? `${collapsed.slice(0, PREVIEW_LIMIT)}…`
			: collapsed;
	} catch {
		return undefined;
	}
}

export default async function SendClipboardCommand() {
	const preview = await clipboardPreview();

	await performOnTarget((device) => pushClipboard(device.id), {
		failureTitle: "Could not send the clipboard",
		success: (device) => ({
			title: `Clipboard sent to ${device.name}`,
			message: preview,
		}),
	});
}
