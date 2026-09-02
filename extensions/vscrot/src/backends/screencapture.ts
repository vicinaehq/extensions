import type { CaptureBackend, CaptureMode } from "./types";
import { run, runInteractiveCapture } from "./utils";

export const screencaptureBackend: CaptureBackend = {
	id: "screencapture",
	displayName: "screencapture (macOS)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => process.platform === "darwin",

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			runInteractiveCapture("screencapture", ["-i", outputPath], outputPath);
		} else if (mode === "window") {
			runInteractiveCapture("screencapture", ["-w", outputPath], outputPath);
		} else {
			run("screencapture", [outputPath]);
		}
	},
};
