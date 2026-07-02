import screenshot from "screenshot-desktop";
import type { CaptureBackend, CaptureMode } from "./types";

// Uses native OS APIs: screencapture (macOS), Win32 GDI (Windows).
// On Linux it falls back to ImageMagick's `import` or scrot - prefer native backends there.
export const screenshotDesktopBackend: CaptureBackend = {
	id: "screenshot-desktop",
	displayName: "screenshot-desktop (npm)",
	supportedModes: ["full", "monitor"],

	isAvailable: () =>
		process.platform === "win32" || process.platform === "darwin",

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "monitor") {
			const displays = await screenshot.listDisplays();
			await screenshot({
				screen: displays[0]?.id,
				filename: outputPath,
				format: "png",
			});
		} else {
			await screenshot({ filename: outputPath, format: "png" });
		}
	},
};
