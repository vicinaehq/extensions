import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, run, runInteractiveCapture } from "./utils";

export const x11ScrotBackend: CaptureBackend = {
	id: "scrot",
	displayName: "scrot (X11)",
	supportedModes: ["area", "window", "full"],

	isAvailable: () => isCommandAvailable("scrot"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		if (mode === "area") {
			runInteractiveCapture("scrot", ["-s", outputPath], outputPath);
		} else if (mode === "window") {
			runInteractiveCapture("scrot", ["-u", outputPath], outputPath);
		} else {
			run("scrot", [outputPath]);
		}
	},
};
