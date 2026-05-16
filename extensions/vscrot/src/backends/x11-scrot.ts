import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable } from "./utils";

export const x11ScrotBackend: CaptureBackend = {
	id: "scrot",
	displayName: "scrot (X11)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => isCommandAvailable("scrot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			execSync(`scrot -s "${outputPath}"`);
		} else if (mode === "window") {
			execSync(`scrot -u "${outputPath}"`);
		} else {
			execSync(`scrot "${outputPath}"`);
		}
	},
};
