import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable, selectMonitor, shellEscape } from "./utils";

export const grimBackend: CaptureBackend = {
	id: "grim",
	displayName: "grim + slurp (Wayland)",
	supportedModes: ["area", "window", "monitor", "full"],

	isAvailable: () => isCommandAvailable("grim") && isCommandAvailable("slurp"),

	capture: async (
		mode: CaptureMode,
		outputPath: string,
		outputName?: string,
	) => {
		const out = shellEscape(outputPath);
		let geometry = "";
		if (mode === "area") {
			geometry = execSync("slurp").toString().trim();
		} else if (mode === "window") {
			geometry = execSync(
				`hyprctl clients -j | jq -r '.[] | select(.mapped == true) | "\\(.at[0]),\\(.at[1]) \\(.size[0])x\\(.size[1])"' | slurp -r`,
			)
				.toString()
				.trim();
		} else if (mode === "monitor") {
			const name = shellEscape(outputName ?? selectMonitor());
			execSync(`grim -o "${name}" "${out}"`);
			return;
		}
		execSync(`grim ${geometry ? `-g "${shellEscape(geometry)}"` : ""} "${out}"`);
	},
};
