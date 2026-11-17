import { KasetError } from "./applescript";
import { hud, hudError } from "./feedback";
import { ensureReady } from "./kaset";

type Options = {
	/**
	 * Launch Kaset and wait for its player to come up when it is not there yet.
	 * Only makes sense for commands that are meant to start playback.
	 */
	launchIfNeeded?: boolean;
};

const RECOVERABLE = new Set(["not-running", "not-ready"]);

/**
 * Shared shell for the background commands: run the action, show what it did,
 * and report any failure even when HUDs are switched off.
 */
export async function runCommand(
	action: () => Promise<string>,
	{ launchIfNeeded = false }: Options = {},
): Promise<void> {
	try {
		await hud(await action());
	} catch (error) {
		const kind = error instanceof KasetError ? error.kind : "unknown";

		if (launchIfNeeded && RECOVERABLE.has(kind)) {
			try {
				await ensureReady();
				await hud(await action());
				return;
			} catch (retryError) {
				await hudError(retryError);
				return;
			}
		}

		await hudError(error);
	}
}

/** "Song — Artist", or a fallback when Kaset has no track loaded. */
export function trackLabel(
	track: { name: string; artist: string } | null,
	fallback = "Nothing playing",
): string {
	if (!track) return fallback;
	return track.artist ? `${track.name} — ${track.artist}` : track.name;
}
