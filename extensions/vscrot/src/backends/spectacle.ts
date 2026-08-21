import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
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
// poor completion signal in both directions: it can linger for many seconds
// after the screenshot is already on disk, and it can also exit before the file
// is written. Worse, when a Spectacle instance is already resident the request
// is served by that process and no new one appears at all, so watching the
// process table cannot tell a finished capture from a running one.
//
// Spectacle announces the outcome on D-Bus instead: ScreenshotTaken carries the
// path it wrote, ScreenshotFailed carries an error. Those are emitted for
// `spectacle -b -o` too, so the CLI stays as the way to name the output file.
// Interactive modes (-r, -a) only report once the user has finished selecting,
// so their wait has to tolerate a human taking their time; the unattended ones
// should never need more than a moment.
const INTERACTIVE_TIMEOUT_MS = 120_000;
const UNATTENDED_TIMEOUT_MS = 15_000;
const POLL_MS = 100;
const STABLE_MS = 300;
// ScreenshotTaken is emitted around the save rather than strictly after it, so
// give the file a moment to appear before calling the capture a failure.
const FILE_GRACE_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mtimeOf = (path: string): number =>
	existsSync(path) ? statSync(path).mtimeMs : -1;

/**
 * Wait for `path` to be written or updated relative to `baseline`, then hold
 * until its size stops growing.
 *
 * This is the fallback for when the D-Bus monitor is unavailable. It cannot see
 * a cancellation at all — a dismissed selector looks exactly like a user who
 * has not finished selecting — so it runs out the timeout in that case.
 */
const waitForFile = async (
	path: string,
	baseline: number,
	deadline: number,
): Promise<void> => {
	let lastSize = -1;
	let stableFor = 0;

	while (Date.now() < deadline) {
		const fresh = mtimeOf(path) > baseline;
		const size = fresh ? statSync(path).size : -1;
		if (size > 0 && size === lastSize) {
			stableFor += POLL_MS;
			if (stableFor >= STABLE_MS) return;
		} else {
			stableFor = 0;
		}
		lastSize = size;
		await sleep(POLL_MS);
	}

	throw new Error("Spectacle produced no screenshot in time");
};

type Outcome =
	| { kind: "taken" }
	| { kind: "failed"; message: string }
	| { kind: "cancelled" }
	| { kind: "timeout" };

/**
 * Watch Spectacle's D-Bus name for the outcome of a capture.
 *
 * `gdbus monitor --dest` reports both the signals and the name's ownership, one
 * line each. Ownership is what stands in for a cancellation: Spectacle says
 * nothing when the user dismisses the selector, but it does go idle and drop the
 * name shortly afterwards. That inference only holds when the name was free to
 * begin with — if the user already has Spectacle open, the name stays owned by
 * that window and a cancelled capture falls back to the timeout.
 */
const watchOutcome = (
	monitor: ChildProcess,
	outputPath: string,
	deadline: number,
): Promise<Outcome> =>
	new Promise((resolve) => {
		const wanted = resolvePath(outputPath);
		let hadOwner = false;
		let buffer = "";

		const timer = setTimeout(
			() => resolve({ kind: "timeout" }),
			Math.max(0, deadline - Date.now()),
		);
		const finish = (outcome: Outcome) => {
			clearTimeout(timer);
			resolve(outcome);
		};

		monitor.stdout?.on("data", (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (line.includes("ScreenshotTaken")) {
					// The path is the signal's only argument. Compare it so a
					// screenshot the user triggered from Spectacle's own window
					// cannot be mistaken for the one we asked for.
					const arg = line.match(/'((?:[^'\\]|\\.)*)'/)?.[1];
					if (!arg || resolvePath(arg) === wanted) finish({ kind: "taken" });
				} else if (line.includes("ScreenshotFailed")) {
					const arg = line.match(/'((?:[^'\\]|\\.)*)'/)?.[1];
					finish({
						kind: "failed",
						message: arg ?? "Spectacle reported a failure",
					});
				} else if (line.includes("is owned by")) {
					hadOwner = true;
				} else if (line.includes("does not have an owner") && hadOwner) {
					finish({ kind: "cancelled" });
				}
			}
		});
		monitor.once("error", () => finish({ kind: "timeout" }));
	});

const startMonitor = (): ChildProcess | null => {
	if (!isCommandAvailable("gdbus")) return null;
	try {
		const monitor = spawn(
			"gdbus",
			["monitor", "--session", "--dest", "org.kde.Spectacle"],
			{ stdio: ["ignore", "pipe", "ignore"] },
		);
		monitor.on("error", () => {});
		return monitor;
	} catch {
		return null;
	}
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
		const interactive = mode === "area" || mode === "window";
		const deadline =
			Date.now() +
			(interactive ? INTERACTIVE_TIMEOUT_MS : UNATTENDED_TIMEOUT_MS);
		// In native hand-off the output path is the user's own screenshot
		// directory, where a file of this name may already exist. Only a write
		// newer than this counts as the capture we are waiting for.
		const baseline = mtimeOf(outputPath);
		const monitor = startMonitor();
		// Subscribing is asynchronous: without this, a fast unattended capture can
		// report back before gdbus has registered its match rule.
		if (monitor) await sleep(200);

		try {
			// -n suppresses KDE's notification, which is what we want whenever the
			// capture lands in a temporary file Vicinae is about to own.
			const args = [FLAG_MAP[mode], "-b", "-o", outputPath];
			if (!options?.notify) args.splice(1, 0, "-n");
			const child = spawn("spectacle", args, {
				detached: true,
				stdio: "ignore",
			});
			// Settle on the launch itself, then let D-Bus tell us when the capture
			// is done rather than waiting for Spectacle to exit.
			await new Promise<void>((resolve, reject) => {
				child.once("error", reject);
				child.once("spawn", () => {
					child.unref();
					resolve();
				});
			});

			if (!monitor) {
				await waitForFile(outputPath, baseline, deadline);
				return;
			}

			const outcome = await watchOutcome(monitor, outputPath, deadline);
			if (outcome.kind === "cancelled") {
				throw new CaptureCancelled("Spectacle capture cancelled");
			}
			if (outcome.kind === "failed") throw new Error(outcome.message);
			if (outcome.kind === "timeout") {
				throw new Error("Spectacle produced no screenshot in time");
			}
			// The signal fired, so the capture happened; wait for the bytes.
			await waitForFile(
				outputPath,
				baseline,
				Math.min(deadline, Date.now() + FILE_GRACE_MS),
			);
		} finally {
			monitor?.kill();
		}
	},
};
