import type { CaptureBackend, CaptureMode, CaptureOptions } from "./types";
import { isCommandAvailable, run, runInteractiveCapture } from "./utils";

const MODE_MAP: Record<CaptureMode, string> = {
	area: "area",
	window: "window",
	monitor: "output",
	full: "screen",
};

export const grimshotBackend: CaptureBackend = {
	id: "grimshot",
	displayName: "grimshot (Sway)",
	supportedModes: ["area", "window", "monitor", "full"],
	targetsNamedOutput: true,

	isAvailable: () => isCommandAvailable("grimshot"),

	capture: async (
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
		options?: CaptureOptions,
	) => {
		if (mode === "monitor" && outputName) {
			// grimshot save output captures the focused output, which races with
			// closeMainWindow() shifting focus. Use grim -o with the named output
			// instead.
			run("grim", ["-o", outputName, outputPath]);
			return;
		}

		const args = ["save", MODE_MAP[mode], outputPath];
		if (options?.notify) args.unshift("--notify");

		// Area and window open an interactive selector, and grimshot exits
		// non-zero without writing a file when the user dismisses it. Let the
		// shared helper turn that outcome into a cancellation.
		if (mode === "area" || mode === "window") {
			runInteractiveCapture("grimshot", args, outputPath);
		} else {
			run("grimshot", args);
		}
	},
};
