import { execSync } from "node:child_process";
import type { CaptureBackend, CaptureMode } from "./types";
import { isCommandAvailable } from "./utils";

const FLAG_MAP: Record<CaptureMode, string> = {
	area: "-r",
	window: "-a",
	monitor: "-m",
	full: "-f",
};

export const spectacleBackend: CaptureBackend = {
	id: "spectacle",
	displayName: "spectacle (KDE)",
	supportedModes: ["area", "window", "monitor", "full"],

	isAvailable: () => isCommandAvailable("spectacle"),

	capture: async (mode: CaptureMode, outputPath: string) => {
		execSync(`spectacle ${FLAG_MAP[mode]} -b -o "${outputPath}"`);
	},
};
