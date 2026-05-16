import { execSync } from "node:child_process";
import { closeMainWindow, showToast } from "@vicinae/api";

export const copyTextToClipboard = (text: string): void => {
	const escaped = text.replace(/'/g, "'\\''");
	try {
		if (process.platform === "darwin") {
			execSync(`printf '%s' '${escaped}' | pbcopy`);
		} else if (process.platform === "win32") {
			execSync(`powershell -Command "Set-Clipboard -Value '${escaped}'"`);
		} else {
			try {
				execSync(`printf '%s' '${escaped}' | wl-copy`);
			} catch {
				execSync(`printf '%s' '${escaped}' | xclip -selection clipboard`);
			}
		}
	} catch (e) {
		console.error("Failed to copy text to clipboard", e);
		showHUD("Clipboard copy failed - install wl-clipboard or xclip");
	}
};

export const copyToClipboard = (imagePath: string, autoClose = true): void => {
	if (process.platform === "darwin") {
		execSync(
			`osascript -e 'set the clipboard to (read (POSIX file "${imagePath}") as «class PNGf»)'`,
		);
	} else if (process.platform === "win32") {
		execSync(
			`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${imagePath}'))"`,
		);
	} else {
		// Prefer wl-copy (Wayland), fall back to xclip (X11)
		try {
			execSync(`wl-copy < "${imagePath}"`);
		} catch {
			execSync(`xclip -selection clipboard -t image/png < "${imagePath}"`);
		}
	}
	showToast({ title: "Copied to clipboard" });
	if (autoClose) closeMainWindow();
};
