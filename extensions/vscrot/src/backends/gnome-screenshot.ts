import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable } from "./utils";

export const gnomeScreenshotBackend: CaptureBackend = {
	id: "gnome-screenshot",
	displayName: "gnome-screenshot (GNOME)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => isCommandAvailable("gnome-screenshot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			execSync(`gnome-screenshot -a -f "${outputPath}"`);
		} else if (mode === "window") {
			execSync(`gnome-screenshot -w -f "${outputPath}"`);
		} else {
			execSync(`gnome-screenshot -f "${outputPath}"`);
		}
	},
};
