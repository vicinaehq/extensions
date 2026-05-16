import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";

export const screencaptureBackend: CaptureBackend = {
	id: "screencapture",
	displayName: "screencapture (macOS)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => process.platform === "darwin",

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			execSync(`screencapture -i "${outputPath}"`);
		} else if (mode === "window") {
			execSync(`screencapture -w "${outputPath}"`);
		} else {
			execSync(`screencapture "${outputPath}"`);
		}
	},
};
