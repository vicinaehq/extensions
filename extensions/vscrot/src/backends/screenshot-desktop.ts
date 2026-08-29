import screenshot from "screenshot-desktop";
import type { CaptureBackend, CaptureMode } from "./types";

type Display = { id: string | number; name?: string };

// Uses native OS APIs: screencapture (macOS), Win32 GDI (Windows).
// On Linux it falls back to ImageMagick's `import` or scrot - prefer native backends there.
export const screenshotDesktopBackend: CaptureBackend = {
	id: "screenshot-desktop",
	displayName: "screenshot-desktop (npm)",
	supportedModes: ["full", "monitor"],

	isAvailable: () =>
		process.platform === "win32" || process.platform === "darwin",

	listDisplays: async () => {
		const displays = await screenshot.listDisplays();
		return (displays as Display[]).map((d) => ({
			id: String(d.id),
			name: d.name || String(d.id),
		}));
	},

	capture: async (
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
	) => {
		if (mode === "monitor") {
			const displays = await screenshot.listDisplays();
			// Honour the display the user picked; only fall back to the first one
			// when the caller could not offer a choice.
			const selected =
				(displays as Display[]).find((d) => String(d.id) === outputName) ??
				displays[0];
			await screenshot({
				screen: selected?.id,
				filename: outputPath,
				format: "png",
			});
		} else {
			await screenshot({ filename: outputPath, format: "png" });
		}
	},
};
