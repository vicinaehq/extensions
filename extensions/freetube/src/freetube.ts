import { closeMainWindow, open, showHUD } from "@vicinae/api";
import { reportError } from "./errors";

/** FreeTube registers a `freetube://` handler that takes a full YouTube URL. */
export function freeTubeUri(youtubeUrl: string): string {
	return `freetube://${youtubeUrl}`;
}

/**
 * Hands a YouTube URL to FreeTube and reports the outcome.
 *
 * The window is closed only after the handoff succeeds, so that a missing
 * FreeTube install surfaces as a toast instead of a silent no-op.
 */
export async function openInFreeTube(
	youtubeUrl: string,
	hudMessage: string,
): Promise<void> {
	try {
		await open(freeTubeUri(youtubeUrl));
	} catch (error) {
		await reportError(
			"Couldn't open FreeTube",
			error,
			"Make sure FreeTube is installed and handles freetube:// links",
		);
		return;
	}

	await closeMainWindow();
	await showHUD(hudMessage);
}
