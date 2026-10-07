import { Clipboard, closeMainWindow, getPreferenceValues } from "@vicinae/api";

type ClipboardPreferences = {
	copyPasswordTransient?: boolean;
	clipboardClearSeconds?: string;
};

let copyGeneration = 0;

// Vicinae closes the launcher asynchronously. Give the host a short,
// platform-neutral focus-settle window before requesting the native paste.
const PASTE_FOCUS_SETTLE_DELAY_MS = 100;

function waitForPasteFocus(): Promise<void> {
	return new Promise((resolve) =>
		setTimeout(resolve, PASTE_FOCUS_SETTLE_DELAY_MS),
	);
}

export async function pasteSecret(value: string): Promise<void> {
	await closeMainWindow();
	await waitForPasteFocus();
	await Clipboard.paste(value);
}

/**
 * Close the launcher before resolving a deferred secret. Metadata-only cache
 * entries may need a protected CLI lookup; that lookup must never keep the
 * launcher visible while it runs.
 */
export async function pasteSecretWithLoader(
	load: () => Promise<string>,
): Promise<void> {
	await closeMainWindow();
	const value = await load();
	await waitForPasteFocus();
	await Clipboard.paste(value);
}

export async function copyProtected(value: string): Promise<void> {
	await Clipboard.copy(value, { concealed: true });
	const generation = ++copyGeneration;
	const preferences = getPreferenceValues<ClipboardPreferences>();
	if (preferences.copyPasswordTransient === false) return;

	const seconds = Number(preferences.clipboardClearSeconds ?? "30");
	const timeout = Number.isFinite(seconds) && seconds > 0 ? seconds : 30;
	setTimeout(async () => {
		try {
			if (
				generation === copyGeneration &&
				(await Clipboard.readText()) === value
			)
				await Clipboard.clear();
		} catch {
			// Clipboard clearing is best-effort and must not disturb the action that copied it.
		}
	}, timeout * 1000);
}
