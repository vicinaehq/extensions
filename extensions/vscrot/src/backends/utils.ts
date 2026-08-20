import { execFileSync, execSync, spawn } from "node:child_process";

/** Escape a path for safe use inside double-quoted shell strings. */
export const shellEscape = (p: string): string => p.replace(/"/g, '\\"');

export const isCommandAvailable = (cmd: string): boolean => {
	try {
		// `command -v` is a POSIX shell builtin and reports every tool as missing
		// on Windows, where `where.exe` is the equivalent lookup.
		if (process.platform === "win32") {
			execFileSync("where.exe", [cmd], { stdio: "ignore" });
		} else {
			execFileSync("/bin/sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
		}
		return true;
	} catch {
		return false;
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
	const monitors: HyprMonitor[] = JSON.parse(
		execSync("hyprctl monitors -j").toString(),
	);
	const regions = monitors.map(logicalGeom).join("\n");
	const selected = execSync("slurp -r", { input: regions }).toString().trim();
	return (
		monitors.find((m) => logicalGeom(m) === selected)?.name ?? monitors[0].name
	);
};
