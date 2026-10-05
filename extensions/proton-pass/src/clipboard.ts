import { Clipboard, closeMainWindow, getPreferenceValues } from "@vicinae/api";

type ClipboardPreferences = {
	copyPasswordTransient?: boolean;
	clipboardClearSeconds?: string;
};

let copyGeneration = 0;

// Vicinae schedules the launcher close asynchronously. Waiting beyond its
// 50 ms close delay prevents GNOME from injecting the paste into the launcher
// search field instead of the window that was focused before it opened.
const PASTE_FOCUS_SETTLE_DELAY_MS = 100;

export async function pasteSecret(value: string): Promise<void> {
	await closeMainWindow();
	await new Promise<void>((resolve) =>
		setTimeout(resolve, PASTE_FOCUS_SETTLE_DELAY_MS),
	);
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
