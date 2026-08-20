import { execFileSync, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { CaptureCancelled } from "./errors";
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
// Interactive modes (-r, -a) only produce a file once the user has finished
// selecting, so their wait has to tolerate a human taking their time; the
// unattended ones should never need more than a moment.
const INTERACTIVE_TIMEOUT_MS = 120_000;
const UNATTENDED_TIMEOUT_MS = 15_000;
const POLL_MS = 100;
const STABLE_MS = 300;
// The D-Bus service takes a moment to come up, during which no spectacle
// process is a normal state rather than evidence of a cancelled capture.
const STARTUP_GRACE_MS = 1_500;
// ...and once it is gone, give the file a moment to land: spectacle sometimes
// exits fractionally before the write completes.
const SETTLE_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether any spectacle process is still alive. The one we spawned is not a
 * reliable witness — the D-Bus service that does the work is a different
 * process — so ask the process table instead. When `pgrep` itself is missing we
 * learn nothing, and saying "still running" leaves the timeout as the backstop.
 */
const spectacleRunning = (): boolean => {
	try {
		execFileSync("pgrep", ["-x", "spectacle"], { stdio: "ignore" });
		return true;
	} catch (e) {
		return (e as { status?: number | null }).status !== 1;
	}
};

const waitForCapture = async (
	outputPath: string,
	interactive: boolean,
): Promise<void> => {
	const started = Date.now();
	const timeout = interactive
		? INTERACTIVE_TIMEOUT_MS
		: UNATTENDED_TIMEOUT_MS;
	const deadline = started + timeout;
	let lastSize = -1;
	let stableFor = 0;
	let goneFor = 0;

	while (Date.now() < deadline) {
		const size = existsSync(outputPath) ? statSync(outputPath).size : -1;
		if (size > 0 && size === lastSize) {
			stableFor += POLL_MS;
			if (stableFor >= STABLE_MS) return;
		} else {
			stableFor = 0;
		}
		lastSize = size;

		// Nothing written and nothing left running means the user dismissed the
		// selector. Waiting out the full timeout there would leave Vicinae closed
		// for two minutes over a keystroke.
		if (size < 0 && Date.now() - started > STARTUP_GRACE_MS) {
			goneFor = spectacleRunning() ? 0 : goneFor + POLL_MS;
			if (goneFor >= SETTLE_MS) {
				throw new CaptureCancelled("Spectacle capture cancelled");
			}
		} else {
			goneFor = 0;
		}

		await sleep(POLL_MS);
	}

	throw new Error(
		`Spectacle produced no screenshot within ${Math.round(timeout / 1000)}s`,
	);
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
		await waitForCapture(outputPath, mode === "area" || mode === "window");
	},
};
