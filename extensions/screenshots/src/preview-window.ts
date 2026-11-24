import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ImageSize } from "./screenshots";

const run = promisify(execFile);

/** Hyprland's default general:gaps_out, which Omarchy keeps. */
const GAP = 10;
/** Preview window size relative to the screenshot's pixel dimensions. */
const SIZE_FACTOR = 0.75;

type HyprMonitor = {
	name: string;
	width: number;
	height: number;
	scale: number;
	/** Space taken by bars: left, top, right, bottom, in logical pixels. */
	reserved: [number, number, number, number];
	focused: boolean;
};

/**
 * Opens `file` in imv as a floating window in the top-right corner of the focused
 * Hyprland monitor. The window is SIZE_FACTOR times the screenshot's pixel size, in
 * Hyprland's logical pixels, so it keeps the screenshot's aspect ratio. A screenshot
 * too big for the monitor at that size is scaled down further, aspect ratio intact.
 * Window rules go through Hyprland's Lua `exec_cmd`, so the window opens in place
 * rather than appearing somewhere else first and then moving.
 */
export async function openFloatingPreview(
	file: string,
	size: ImageSize | undefined,
): Promise<void> {
	if (!process.env.HYPRLAND_INSTANCE_SIGNATURE) {
		throw new Error("The full preview window needs a Hyprland session.");
	}
	// Hyprland would start a missing imv without complaint; fail here instead.
	if (!(await isOnPath("imv"))) {
		throw new Error(
			"imv is not installed. Install it to use the full preview.",
		);
	}

	const { stdout } = await run("hyprctl", ["monitors", "-j"]);
	const monitor = (JSON.parse(stdout) as HyprMonitor[]).find((m) => m.focused);
	if (!monitor) throw new Error("Hyprland reports no focused monitor.");

	const [left, top, right, bottom] = monitor.reserved;
	const monitorWidth = Math.floor(monitor.width / monitor.scale);
	const monitorHeight = Math.floor(monitor.height / monitor.scale);
	const maxWidth = monitorWidth - left - right - 2 * GAP;
	const maxHeight = monitorHeight - top - bottom - 2 * GAP;

	// Unparsable header: fall back to the same share of the usable area.
	const { width: imageWidth, height: imageHeight } = size ?? {
		width: maxWidth,
		height: maxHeight,
	};
	const scale = Math.min(
		SIZE_FACTOR,
		maxWidth / imageWidth,
		maxHeight / imageHeight,
	);
	const width = Math.round(imageWidth * scale);
	const height = Math.round(imageHeight * scale);

	// `move` in exec rules is relative to the monitor's top-left corner.
	const x = monitorWidth - right - GAP - width;
	const y = top + GAP;

	const command = `imv ${shellQuote(file)}`;
	const rules = `{ float = true, monitor = ${luaString(monitor.name)}, size = { ${width}, ${height} }, move = { ${x}, ${y} } }`;
	await run("hyprctl", [
		"dispatch",
		`hl.dsp.exec_cmd(${luaString(command)}, ${rules})`,
	]);
}

async function isOnPath(program: string): Promise<boolean> {
	for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
		if (!dir) continue;
		try {
			await access(path.join(dir, program), constants.X_OK);
			return true;
		} catch {
			// Not in this directory.
		}
	}
	return false;
}

/** Single-quotes `value` for /bin/sh, which Hyprland runs `exec_cmd` through. */
function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Lua long-bracket literal: no escapes, with a level that `value` cannot close early. */
function luaString(value: string): string {
	let level = "";
	while (`${value}]${level}]`.indexOf(`]${level}]`) !== value.length) {
		level += "=";
	}
	return `[${level}[${value}]${level}]`;
}
