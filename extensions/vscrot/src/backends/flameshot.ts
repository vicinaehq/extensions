import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, shellEscape } from "./utils";

export const flameshotBackend: CaptureBackend = {
	id: "flameshot",
	displayName: "flameshot",
	supportedModes: ["area", "full"],

	isAvailable: () => isCommandAvailable("flameshot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		const out = shellEscape(outputPath);
		if (mode === "area") {
			execSync(`flameshot gui --raw > "${out}"`);
		} else {
			execSync(`flameshot screen --raw > "${out}"`);
		}
	},
};
