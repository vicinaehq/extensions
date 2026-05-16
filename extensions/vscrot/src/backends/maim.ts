import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable } from "./utils";

export const maimBackend: CaptureBackend = {
	id: "maim",
	displayName: "maim + slop (X11)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => isCommandAvailable("maim"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			const geometry = execSync("slop -f '%x,%y %wx%h'").toString().trim();
			execSync(`maim -g "${geometry}" "${outputPath}"`);
		} else if (mode === "window") {
			const id = execSync("xdotool getactivewindow").toString().trim();
			execSync(`maim -i "${id}" "${outputPath}"`);
		} else {
			execSync(`maim "${outputPath}"`);
		}
	},
};
