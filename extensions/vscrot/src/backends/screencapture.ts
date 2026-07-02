import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { shellEscape } from "./utils";

export const screencaptureBackend: CaptureBackend = {
	id: "screencapture",
	displayName: "screencapture (macOS)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => process.platform === "darwin",

	capture: async (mode: CaptureMode, outputPath: string) => {
		const out = shellEscape(outputPath);
		if (mode === "area") {
			execSync(`screencapture -i "${out}"`);
		} else if (mode === "window") {
			execSync(`screencapture -w "${out}"`);
		} else {
			execSync(`screencapture "${out}"`);
		}
	},
};
