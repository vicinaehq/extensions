import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, shellEscape } from "./utils";

export const x11ScrotBackend: CaptureBackend = {
	id: "scrot",
	displayName: "scrot (X11)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => isCommandAvailable("scrot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		const out = shellEscape(outputPath);
		if (mode === "area") {
			execSync(`scrot -s "${out}"`);
		} else if (mode === "window") {
			execSync(`scrot -u "${out}"`);
		} else {
			execSync(`scrot "${out}"`);
		}
	},
};
