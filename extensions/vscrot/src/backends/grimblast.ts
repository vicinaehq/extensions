import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, selectMonitor, shellEscape } from "./utils";

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

	isAvailable: () => isCommandAvailable("grimblast"),

	capture: async (
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
	) => {
		const out = shellEscape(outputPath);
		if (mode === "monitor") {
			// grimblast save output captures the focused output, which races with
			// closeMainWindow() shifting focus. Use grim -o with named output instead.
			const name = shellEscape(outputName ?? selectMonitor());
			execSync(`grim -o "${name}" "${out}"`);
		} else if (mode === "window") {
			// grimblast save active captures whatever window has focus after Vicinae closes.
			// Use hyprctl + slurp for reliable interactive window selection instead.
			const geometry = execSync(
				`hyprctl clients -j | jq -r '.[] | select(.mapped == true) | "\\(.at[0]),\\(.at[1]) \\(.size[0])x\\(.size[1])"' | slurp -r`,
			)
				.toString()
				.trim();
			execSync(`grim -g "${shellEscape(geometry)}" "${out}"`);
		} else {
			execSync(`grimblast save ${MODE_MAP[mode]} "${out}"`);
		}
	},
};
