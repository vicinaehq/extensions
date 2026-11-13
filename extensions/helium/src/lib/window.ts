import { execFile } from "node:child_process";
import { WindowManagement } from "@vicinae/api";

export type WindowManager = "niri" | "hyprland" | "sway" | "i3" | "kde" | "gnome" | "unknown";

/** Identify the running Wayland compositor/desktop from the session environment. */
export function detectWindowManager(): WindowManager {
	const env = process.env;
	if (env.NIRI_SOCKET) return "niri";
	if (env.HYPRLAND_INSTANCE_SIGNATURE) return "hyprland";
	if (env.SWAYSOCK) return "sway";
	if (env.I3SOCK) return "i3";
	if (env.KDE_FULL_SESSION) return "kde";

	const desktop =
		`${env.XDG_CURRENT_DESKTOP ?? ""}:${env.XDG_SESSION_DESKTOP ?? ""}:${env.DESKTOP_SESSION ?? ""}`.toLowerCase();
	if (desktop.includes("niri")) return "niri";
	if (desktop.includes("hyprland")) return "hyprland";
	if (desktop.includes("sway")) return "sway";
	if (desktop.includes("i3")) return "i3";
	if (desktop.includes("gnome")) return "gnome";
	if (desktop.includes("kde") || desktop.includes("plasma")) return "kde";
	return "unknown";
}

/** Chromium forks report a Helium app id/class; titles end in "- Helium". */
function isHeliumWindow(appId: string | undefined, title: string | undefined): boolean {
	return /helium|net\.imput\.helium/i.test(appId ?? "") || /helium$/i.test((title ?? "").trim());
}

function runCommand(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(command, args, { timeout: 3000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
			if (error) reject(error);
			else resolve(stdout);
		});
	});
}

/**
 * Ask Vicinae's window management service first: it works with most Linux
 * desktops and avoids spawning compositor-specific tools. KDE support is
 * limited, so the native fallbacks below still matter.
 */
async function focusViaWindowManagement(): Promise<boolean> {
	try {
		const windows = await WindowManagement.getWindows();
		const matches = windows.filter((window) =>
			isHeliumWindow(
				[window.application?.id, window.application?.name, window.application?.path].filter(Boolean).join(" "),
				window.title,
			),
		);
		const target = matches.find((window) => window.active) ?? matches[0];
		if (!target) return false;

		return await target.focus();
	} catch {
		return false;
	}
}

type NiriWindow = {
	id: number;
	app_id: string;
	title: string;
	is_focused: boolean;
	focus_timestamp?: { secs: number; nanos: number };
};

async function focusNiriWindow(): Promise<boolean> {
	const windows = JSON.parse(await runCommand("niri", ["msg", "--json", "windows"])) as NiriWindow[];
	const matches = windows.filter((window) => isHeliumWindow(window.app_id, window.title));
	if (matches.length === 0) return false;

	// Prefer the already-focused window, then the most recently focused one.
	const target =
		matches.find((window) => window.is_focused) ??
		matches.sort((a, b) => {
			const at = a.focus_timestamp ? a.focus_timestamp.secs * 1e9 + a.focus_timestamp.nanos : 0;
			const bt = b.focus_timestamp ? b.focus_timestamp.secs * 1e9 + b.focus_timestamp.nanos : 0;
			return bt - at;
		})[0];
	if (!target) return false;

	await runCommand("niri", ["msg", "action", "focus-window", "--id", String(target.id)]);
	return true;
}

type HyprlandClient = {
	address: string;
	class: string;
	title: string;
	focusHistoryID?: number;
};

async function focusHyprlandWindow(): Promise<boolean> {
	const clients = JSON.parse(await runCommand("hyprctl", ["clients", "-j"])) as HyprlandClient[];
	const matches = clients.filter((client) => isHeliumWindow(client.class, client.title));
	if (matches.length === 0) return false;

	matches.sort((a, b) => (a.focusHistoryID ?? Infinity) - (b.focusHistoryID ?? Infinity));
	const target = matches[0];
	if (!target) return false;

	await runCommand("hyprctl", ["dispatch", "focuswindow", `address:${target.address}`]);
	return true;
}

type SwayNode = {
	id?: number;
	name?: string;
	app_id?: string;
	pid?: number;
	focused?: boolean;
	window_properties?: { class?: string; instance?: string; title?: string };
	nodes?: SwayNode[];
	floating_nodes?: SwayNode[];
};

function collectTreeNodes(node: SwayNode, output: SwayNode[] = []): SwayNode[] {
	output.push(node);
	for (const child of [...(node.nodes ?? []), ...(node.floating_nodes ?? [])]) {
		collectTreeNodes(child, output);
	}
	return output;
}

/** Sway and i3 share the same tree JSON and criteria syntax. */
async function focusSwayWindow(command: "swaymsg" | "i3-msg"): Promise<boolean> {
	const parsed = JSON.parse(await runCommand(command, ["-t", "get_tree"])) as SwayNode | SwayNode[];
	const roots = Array.isArray(parsed) ? parsed : [parsed];
	const nodes = roots.flatMap((root) => collectTreeNodes(root));

	const matches = nodes.filter((node) => {
		// Skip workspace/output containers; only real windows have one of these.
		if (node.id === undefined || (!node.app_id && !node.pid && !node.window_properties)) return false;
		return isHeliumWindow(
			node.app_id ?? node.window_properties?.class,
			node.name ?? node.window_properties?.title,
		);
	});
	const target = matches.find((node) => node.focused) ?? matches[0];
	if (target?.id === undefined) return false;

	await runCommand(command, [`[con_id=${target.id}]`, "focus"]);
	return true;
}

/** kdotool is the KWin Wayland equivalent of xdotool; it is not installed by default. */
async function focusKdeWindow(): Promise<boolean> {
	try {
		const ids = (await runCommand("kdotool", ["search", "--class", "helium"]))
			.split("\n")
			.filter((id) => id.trim() !== "");
		const [id] = ids;
		if (id) {
			await runCommand("kdotool", ["windowactivate", id]);
			return true;
		}
	} catch {
		// kdotool unavailable; the X11 fallback runs next
	}

	return false;
}

/**
 * GNOME's Shell exposes window activation over D-Bus, but `Eval` is disabled
 * unless unsafe mode is on. `activeWindow` then falls back to the X11 tools,
 * which still work for Helium running under XWayland.
 */
const GNOME_ACTIVATE_SCRIPT =
	"(() => {" +
	' const win = global.get_window_actors().map((a) => a.meta_window)' +
	'  .find((w) => ((w.get_wm_class() ?? "") + ":" + (w.get_title() ?? "")).toLowerCase().includes("helium"));' +
	" if (!win) return false; win.activate(global.get_current_time()); return true;" +
	"})()";

async function focusGnomeWindow(): Promise<boolean> {
	try {
		const output = await runCommand("gdbus", [
			"call",
			"--session",
			"--dest",
			"org.gnome.Shell",
			"--object-path",
			"/org/gnome/Shell",
			"--method",
			"org.gnome.Shell.Eval",
			GNOME_ACTIVATE_SCRIPT,
		]);
		const match = /^\(true, '(.*)'\)$/.exec(output.trim());
		if (match?.[1] === "true") return true;
	} catch {
		// gdbus missing or the Shell is unreachable; the X11 fallback runs next
	}

	return false;
}

async function focusWithX11Tools(): Promise<boolean> {
	for (const args of [
		["-x", "-a", "helium"],
		["-a", "Helium"],
	]) {
		try {
			await runCommand("wmctrl", args);
			return true;
		} catch {
			// no matching window or wmctrl unavailable
		}
	}

	try {
		const ids = (await runCommand("xdotool", ["search", "--class", "helium"]))
			.split("\n")
			.filter((id) => id.trim() !== "");
		const [id] = ids;
		if (id) {
			await runCommand("xdotool", ["windowactivate", id]);
			return true;
		}
	} catch {
		// xdotool unavailable
	}

	return false;
}

/**
 * Bring the Helium window to the foreground. Wayland clients cannot raise
 * themselves, so this asks Vicinae's window management service first and then
 * falls back to the running compositor's own interface: niri, Hyprland,
 * sway/i3, KDE (kdotool) and GNOME are handled natively, with `wmctrl` and
 * `xdotool` as a generic X11 fallback. Returns false when no Helium window was
 * found or the desktop is unsupported.
 */
export async function activeWindow(): Promise<boolean> {
	if (await focusViaWindowManagement()) return true;

	switch (detectWindowManager()) {
		case "niri":
			if (await focusNiriWindow().catch(() => false)) return true;
			break;
		case "hyprland":
			if (await focusHyprlandWindow().catch(() => false)) return true;
			break;
		case "sway":
			if (await focusSwayWindow("swaymsg").catch(() => false)) return true;
			break;
		case "i3":
			if (await focusSwayWindow("i3-msg").catch(() => false)) return true;
			break;
		case "kde":
			if (await focusKdeWindow().catch(() => false)) return true;
			break;
		case "gnome":
			if (await focusGnomeWindow().catch(() => false)) return true;
			break;
	}

	return focusWithX11Tools().catch(() => false);
}
