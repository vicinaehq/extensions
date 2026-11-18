import {
	Clipboard,
	closeMainWindow,
	getPreferenceValues,
	showHUD,
	showToast,
	Toast,
	WindowManagement,
} from "@vicinae/api";

export type ClipboardPreferences = {
	closeAfterCopy?: boolean;
	transientClipboard?: boolean;
	clipboardClearSeconds?: string;
};

let copyGeneration = 0;

async function setCodeOnClipboard(code: string): Promise<ClipboardPreferences> {
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
	return prefs;
}

/** Copy a TOTP code, optionally clearing it only if it remains untouched. */
export async function copyCode(label: string, code: string): Promise<void> {
	const prefs = await setCodeOnClipboard(code);
	if (prefs.closeAfterCopy === true) {
		await showHUD(`${label} copied`);
		await closeMainWindow();
	} else {
		await showToast({ style: Toast.Style.Success, title: `${label} copied` });
	}
}

/** Paste the selected TOTP, leaving a clipboard fallback if pasting fails. */
export async function pasteCode(code: string): Promise<void> {
	await setCodeOnClipboard(code);
	let previousWindow: WindowManagement.Window | undefined;
	if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
		try {
			const activeWindow = await WindowManagement.getActiveWindow();
			if (
				!/vicinae/i.test(activeWindow.application?.name ?? "") &&
				!/^vicinae\b/i.test(activeWindow.title)
			) {
				previousWindow = activeWindow;
			}
		} catch {
			// Focus recovery is best-effort; native paste still handles the handoff.
		}
	}
	try {
		await closeMainWindow();
		try {
			await previousWindow?.focus();
		} catch {
			// Do not block pasting when the original window can no longer be focused.
		}
		await Clipboard.paste(code);
	} catch {
		await showToast({
			style: Toast.Style.Failure,
			title: "Automatic paste unavailable",
			message: "The code is on your clipboard. Paste it manually.",
		});
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
