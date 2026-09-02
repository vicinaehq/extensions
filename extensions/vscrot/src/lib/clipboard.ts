import { Clipboard, closeMainWindow, showHUD, showToast } from "@vicinae/api";

export const copyTextToClipboard = async (text: string): Promise<void> => {
	try {
		await Clipboard.copy(text);
	} catch (e) {
		console.error("Failed to copy text to clipboard", e);
		showHUD("Clipboard copy failed");
	}
};

export const copyToClipboard = async (
	imagePath: string,
	autoClose = true,
): Promise<void> => {
	try {
		await Clipboard.copy({ file: imagePath });
		showToast({ title: "Copied to clipboard" });
	} catch (e) {
		console.error("Failed to copy image to clipboard", e);
		showHUD("Clipboard copy failed");
		return;
	}
	if (autoClose) closeMainWindow();
};
