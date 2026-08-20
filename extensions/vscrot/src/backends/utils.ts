import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { CaptureCancelled } from "./errors";

export const isCommandAvailable = (cmd: string): boolean => {
	try {
		// `command -v` is a POSIX shell builtin and reports every tool as missing
		// on Windows, where `where.exe` is the equivalent lookup.
		if (process.platform === "win32") {
			execFileSync("where.exe", [cmd], { stdio: "ignore" });
		} else {
			execFileSync("/bin/sh", ["-c", 'command -v "$1"', "sh", cmd], {
				stdio: "ignore",
			});
		}
		return true;
	} catch {
		return false;
	}
};

type ExecFailure = { status?: number | null; stderr?: Buffer | string };

export const stderrOf = (e: unknown): string =>
	String((e as ExecFailure).stderr ?? "").trim();

// Selection tools word a dismissal differently, and some say nothing at all.
const CANCELLED = /cancel|abort/i;

/**
 * Whether a failed command looks like the user backing out rather than
 * something going wrong.
 *
 * The `status` check carries the weight: a process that never started — a
 * missing slurp or slop — also fails silently, and reading that silence as a
 * cancellation is how a missing dependency turns into a command that appears to
 * do nothing at all. Only a process that ran and exited non-zero can have been
 * cancelled.
 */
export const looksCancelled = (e: unknown): boolean => {
	if (typeof (e as ExecFailure).status !== "number") return false;
	const stderr = stderrOf(e);
	return stderr === "" || CANCELLED.test(stderr);
};

/**
 * Runs a command with its arguments handed straight to execve. Nothing passes
 * through a shell, so a screenshot path containing spaces, quotes, `$(...)` or
 * backticks is treated as data rather than as code to run.
 */
export const run = (command: string, args: string[]): string =>
	execFileSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();

/**
 * Runs an interactive region or window selector. These exit non-zero precisely
 * when the user made no selection, so that outcome is a cancellation. A
 * selector that fails for its own reasons — an unsupported compositor protocol,
 * say — says so on stderr, and that is a real error worth surfacing.
 */
export const runSelector = (
	command: string,
	args: string[],
	input?: string,
): string => {
	try {
		return execFileSync(command, args, {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			input: input ?? "",
		}).trim();
	} catch (e) {
		if (looksCancelled(e)) {
			throw new CaptureCancelled(`${command} selection cancelled`);
		}
		throw e;
	}
};

/**
 * Runs a tool that selects and captures in a single shot. Such a tool cannot
 * report cancellation separately from failure, so the only safe reading is that
 * nothing was written and nothing was said, therefore the user backed out.
 * Anything that leaves a message is reported as the failure it is.
 */
export const runInteractiveCapture = (
	command: string,
	args: string[],
	outputPath: string,
): void => {
	try {
		run(command, args);
	} catch (e) {
		if (!existsSync(outputPath) && looksCancelled(e)) {
			throw new CaptureCancelled(`${command} capture cancelled`);
		}
		throw e;
	}
};

/**
 * Runs a command that streams the image on stdout, wiring that stream straight
 * to a file descriptor. This replaces shell redirection, which would need a
 * shell — and on Windows cmd.exe, whose redirection cannot be trusted with a
 * binary stream.
 */
export const runCaptureToFile = (
	command: string,
	args: string[],
	outputPath: string,
): void => {
	const fd = openSync(outputPath, "w");
	try {
		execFileSync(command, args, { stdio: ["ignore", fd, "pipe"] });
	} finally {
		closeSync(fd);
	}
};

/**
 * Launches a GUI editor without waiting for the user to close it. The promise
 * settles as soon as the outcome of the launch itself is known: it rejects when
 * the process cannot start (missing binary, permission denied) and resolves once
 * it is running, so callers can report a launch failure without blocking on the
 * editing session.
 */
export const launchDetached = (
	command: string,
	args: string[],
): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});

type HyprMonitor = {
	x: number;
	y: number;
	width: number;
	height: number;
	scale: number;
	transform: number;
	name: string;
};

const logicalGeom = (m: HyprMonitor): string => {
	const swapped = m.transform % 2 === 1;
	const w = swapped
		? Math.floor(m.height / m.scale)
		: Math.floor(m.width / m.scale);
	const h = swapped
		? Math.floor(m.width / m.scale)
		: Math.floor(m.height / m.scale);
	return `${m.x},${m.y} ${w}x${h}`;
};

// Presents all monitors via slurp and returns the Wayland output name of the
// one the user selected. Using the name with `grim -o` lets grim handle
// transform/scale/rotation natively, avoiding geometry math bugs.
export const selectMonitor = (): string => {
	const monitors: HyprMonitor[] = JSON.parse(run("hyprctl", ["monitors", "-j"]));
	const regions = monitors.map(logicalGeom).join("\n");
	const selected = runSelector("slurp", ["-r"], regions);
	return (
		monitors.find((m) => logicalGeom(m) === selected)?.name ?? monitors[0].name
	);
};

// hyprctl → jq → slurp is a pipeline of three fixed commands with no
// caller-supplied data anywhere in it, so running it through a shell is safe.
// The capture path, which does carry a user-configured filename, never goes
// near a shell.
const HYPR_WINDOW_PIPELINE =
	'hyprctl clients -j | jq -r \'.[] | select(.mapped == true) | "\\(.at[0]),\\(.at[1]) \\(.size[0])x\\(.size[1])"\' | slurp -r';

/**
 * Presents every mapped Hyprland window through slurp and returns the geometry
 * the user picked. A missing `jq` or `slurp` surfaces on stderr and is reported
 * as the error it is, rather than passing for a cancelled selection.
 */
export const selectWindowGeometry = (): string =>
	runSelector("/bin/sh", ["-c", HYPR_WINDOW_PIPELINE]);
