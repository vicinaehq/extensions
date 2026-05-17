import { execSync } from "node:child_process";

/** Escape a path for safe use inside double-quoted shell strings. */
export const shellEscape = (p: string): string => p.replace(/"/g, '\\"');

export const isCommandAvailable = (cmd: string): boolean => {
	try {
		execSync(`command -v ${cmd}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

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
