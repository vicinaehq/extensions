import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, run, runInteractiveCapture } from "./utils";

export const gnomeScreenshotBackend: CaptureBackend = {
	id: "gnome-screenshot",
	displayName: "gnome-screenshot (GNOME)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => isCommandAvailable("gnome-screenshot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			runInteractiveCapture(
				"gnome-screenshot",
				["-a", "-f", outputPath],
				outputPath,
			);
		} else if (mode === "window") {
			runInteractiveCapture(
				"gnome-screenshot",
				["-w", "-f", outputPath],
				outputPath,
			);
		} else {
			run("gnome-screenshot", ["-f", outputPath]);
		}
	},
};
