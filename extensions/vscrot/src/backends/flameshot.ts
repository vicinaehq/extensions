import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable } from "./utils";

export const flameshotBackend: CaptureBackend = {
	id: "flameshot",
	displayName: "flameshot",
	supportedModes: ["area", "full"],

	isAvailable: () => isCommandAvailable("flameshot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			execSync(`flameshot gui --raw > "${outputPath}"`);
		} else {
			execSync(`flameshot screen --raw > "${outputPath}"`);
		}
	},
};
