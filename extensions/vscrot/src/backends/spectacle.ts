import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import type { CaptureBackend, CaptureMode, CaptureOptions } from "./types";
import { isCommandAvailable } from "./utils";

const FLAG_MAP: Record<CaptureMode, string> = {
	area: "-r",
	window: "-a",
	monitor: "-m",
	full: "-f",
};

// Spectacle's background mode is D-Bus activated, so the process we spawn is a
// poor completion signal in both directions: it can linger for many seconds after
// the screenshot is already on disk, and it can also exit before the file is
// written. Watch the output file instead — it is the thing we actually need.
// Interactive modes (-r) only produce a file once the user has finished
// selecting, so the wait has to tolerate a human taking their time.
const FILE_TIMEOUT_MS = 120_000;
const POLL_MS = 100;
const STABLE_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForCapture = async (outputPath: string): Promise<void> => {
	const deadline = Date.now() + FILE_TIMEOUT_MS;
	let lastSize = -1;
	let stableFor = 0;

	while (Date.now() < deadline) {
		const size = existsSync(outputPath) ? statSync(outputPath).size : -1;
		if (size > 0 && size === lastSize) {
			stableFor += POLL_MS;
			if (stableFor >= STABLE_MS) return;
		} else {
			stableFor = 0;
		}
		lastSize = size;
		await sleep(POLL_MS);
	}

	// No file within the timeout: the user cancelled, or Spectacle failed after
	// the process we spawned had already exited successfully.
	throw new Error("Spectacle produced no screenshot");
};

export const spectacleBackend: CaptureBackend = {
	id: "spectacle",
	displayName: "spectacle (KDE)",
	supportedModes: ["area", "window", "monitor", "full"],

	isAvailable: () => isCommandAvailable("spectacle"),

	capture: async (
		mode: CaptureMode,
		outputPath: string,
		_outputName?: string,
		options?: CaptureOptions,
	) => {
		// -n suppresses KDE's notification, which is what we want whenever the
		// capture lands in a temporary file Vicinae is about to own.
		const args = [FLAG_MAP[mode], "-b", "-o", outputPath];
		if (!options?.notify) args.splice(1, 0, "-n");
		const child = spawn("spectacle", args, {
			detached: true,
			stdio: "ignore",
		});
		// Settle on the launch itself, then let the file tell us when the capture
		// is done rather than waiting for Spectacle to exit.
		await new Promise<void>((resolve, reject) => {
			child.once("error", reject);
			child.once("spawn", () => {
				child.unref();
				resolve();
			});
		});
		await waitForCapture(outputPath);
	},
};
