import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, run, runSelector } from "./utils";

export const maimBackend: CaptureBackend = {
	id: "maim",
	displayName: "maim + slop (X11)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => isCommandAvailable("maim"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			const geometry = runSelector("slop", ["-f", "%x,%y %wx%h"]);
			run("maim", ["-g", geometry, outputPath]);
		} else if (mode === "window") {
			const id = run("xdotool", ["getactivewindow"]);
			run("maim", ["-i", id, outputPath]);
		} else {
			run("maim", [outputPath]);
		}
	},
};
