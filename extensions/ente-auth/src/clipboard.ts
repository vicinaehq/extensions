import {
	Clipboard,
	closeMainWindow,
	getPreferenceValues,
	showHUD,
	showToast,
	Toast,
} from "@vicinae/api";

export type ClipboardPreferences = {
	closeAfterCopy?: boolean;
	transientClipboard?: boolean;
	clipboardClearSeconds?: string;
};

let copyGeneration = 0;

/** Copy a TOTP code, optionally clearing it only if it remains untouched. */
export async function copyCode(label: string, code: string): Promise<void> {
	await Clipboard.copy(code, { concealed: true });
	const generation = ++copyGeneration;
	const prefs = getPreferenceValues<ClipboardPreferences>();
	if (prefs.transientClipboard !== false) {
		const parsedSeconds = Number(prefs.clipboardClearSeconds ?? "30");
		const seconds =
			Number.isFinite(parsedSeconds) && parsedSeconds > 0 ? parsedSeconds : 30;
		setTimeout(async () => {
			try {
				if (
					generation === copyGeneration &&
					(await Clipboard.readText()) === code
				) {
					await Clipboard.clear();
				}
			} catch {
				// Clearing is best-effort and must not turn a successful copy into an error.
			}
		}, seconds * 1000);
	}
	if (prefs.closeAfterCopy === true) {
		await showHUD(`${label} copied`);
		await closeMainWindow();
	} else {
		await showToast({ style: Toast.Style.Success, title: `${label} copied` });
	}
}

export async function guardAction(
	title: string,
	action: () => Promise<void>,
): Promise<void> {
	try {
		await action();
	} catch (reason: unknown) {
		await showToast({
			style: Toast.Style.Failure,
			title,
			message: reason instanceof Error ? reason.message : String(reason),
		});
	}
}
