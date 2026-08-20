import type { CaptureBackend, CaptureMode } from "./types";
import {
	isCommandAvailable,
	run,
	selectMonitor,
	selectWindowGeometry,
} from "./utils";

const MODE_MAP: Record<CaptureMode, string> = {
	area: "area",
	window: "active",
	monitor: "output",
	full: "screen",
};

export const grimblastBackend: CaptureBackend = {
	id: "grimblast",
	displayName: "grimblast (Hyprland)",
	supportedModes: ["area", "window", "monitor", "full"],
	targetsNamedOutput: true,

	isAvailable: () => isCommandAvailable("grimblast"),

	capture: async (
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
	) => {
		if (mode === "monitor") {
			// grimblast save output captures the focused output, which races with
			// closeMainWindow() shifting focus. Use grim -o with named output instead.
			run("grim", ["-o", outputName ?? selectMonitor(), outputPath]);
		} else if (mode === "window") {
			// grimblast save active captures whatever window has focus after Vicinae
			// closes. Use hyprctl + slurp for reliable interactive window selection.
			run("grim", ["-g", selectWindowGeometry(), outputPath]);
		} else {
			run("grimblast", ["save", MODE_MAP[mode], outputPath]);
		}
	},
};
