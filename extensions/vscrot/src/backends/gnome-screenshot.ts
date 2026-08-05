import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, shellEscape } from "./utils";

export const gnomeScreenshotBackend: CaptureBackend = {
	id: "gnome-screenshot",
	displayName: "gnome-screenshot (GNOME)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => isCommandAvailable("gnome-screenshot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		const out = shellEscape(outputPath);
		if (mode === "area") {
			execSync(`gnome-screenshot -a -f "${out}"`);
		} else if (mode === "window") {
			execSync(`gnome-screenshot -w -f "${out}"`);
		} else {
			execSync(`gnome-screenshot -f "${out}"`);
		}
	},
};
