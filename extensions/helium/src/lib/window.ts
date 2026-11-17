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

/**
 * Pick the Helium window that belongs to a tab. Chromium names a window after
 * its active tab (`GitHub - Helium`), so an explicit title selects the right
 * window when several Helium windows are open. Without a match we return
 * nothing rather than raising an unrelated window.
 */
function findWindow<T>(
	windows: T[],
	title: string | undefined,
	getTitle: (window: T) => string | undefined,
	isPreferred: (window: T) => boolean,
): T | undefined {
	const wanted = title?.trim().toLowerCase();
	if (!wanted) return windows.find(isPreferred) ?? windows[0];

	const exact = windows.filter((window) => {
		const name = (getTitle(window) ?? "").trim().toLowerCase();
		return name === wanted || name === `${wanted} - helium`;
	});
	if (exact.length > 0) return exact.find(isPreferred) ?? exact[0];

	const prefixed = windows.filter((window) =>
		(getTitle(window) ?? "").trim().toLowerCase().startsWith(`${wanted} - `),
	);
	return prefixed.find(isPreferred) ?? prefixed[0];
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
async function focusViaWindowManagement(title?: string): Promise<boolean> {
	try {
		const windows = await WindowManagement.getWindows();
		const matches = windows.filter((window) =>
			isHeliumWindow(
				[window.application?.id, window.application?.name, window.application?.path].filter(Boolean).join(" "),
				window.title,
			),
		);
		const target = findWindow(
			matches,
			title,
			(window) => window.title,
			(window) => window.active,
		);
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

async function focusNiriWindow(title?: string): Promise<boolean> {
	const windows = JSON.parse(await runCommand("niri", ["msg", "--json", "windows"])) as NiriWindow[];
	const matches = windows
		.filter((window) => isHeliumWindow(window.app_id, window.title))
		.sort((a, b) => {
			const at = a.focus_timestamp ? a.focus_timestamp.secs * 1e9 + a.focus_timestamp.nanos : 0;
			const bt = b.focus_timestamp ? b.focus_timestamp.secs * 1e9 + b.focus_timestamp.nanos : 0;
			return bt - at;
		});
	const target = findWindow(
		matches,
		title,
		(window) => window.title,
		(window) => window.is_focused,
	);
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

async function focusHyprlandWindow(title?: string): Promise<boolean> {
	const clients = JSON.parse(await runCommand("hyprctl", ["clients", "-j"])) as HyprlandClient[];
	const matches = clients
		.filter((client) => isHeliumWindow(client.class, client.title))
		.sort((a, b) => (a.focusHistoryID ?? Infinity) - (b.focusHistoryID ?? Infinity));
	const target = findWindow(
		matches,
		title,
		(client) => client.title,
		() => false,
	);
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
async function focusSwayWindow(command: "swaymsg" | "i3-msg", title?: string): Promise<boolean> {
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
	const target = findWindow(
		matches,
		title,
		(node) => node.name ?? node.window_properties?.title,
		(node) => node.focused === true,
	);
	if (target?.id === undefined) return false;

	await runCommand(command, [`[con_id=${target.id}]`, "focus"]);
	return true;
}

/** kdotool is the KWin Wayland equivalent of xdotool; it is not installed by default. */
async function focusKdeWindow(title?: string): Promise<boolean> {
	try {
		const ids = (await runCommand("kdotool", ["search", "--class", "helium"]))
			.split("\n")
			.filter((id) => id.trim() !== "");

		for (const id of ids) {
			if (title?.trim()) {
				const name = await runCommand("kdotool", ["getwindowname", id]);
				const wanted = title.trim().toLowerCase();
				const windowName = name.trim().toLowerCase();
				if (
					windowName !== wanted &&
					windowName !== `${wanted} - helium` &&
					!windowName.startsWith(`${wanted} - `)
				) {
					continue;
				}
			}

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
function gnomeActivateScript(title?: string): string {
	// JSON.stringify keeps page-controlled titles from becoming executable code.
	const wanted = title?.trim() ? JSON.stringify(title.trim().toLowerCase()) : "null";
	return `(() => {
	const wanted = ${wanted};
	const win = global.get_window_actors().map((a) => a.meta_window).find((w) => {
		const name = (w.get_title() ?? "").toLowerCase();
		const cls = (w.get_wm_class() ?? "").toLowerCase();
		if (!cls.includes("helium") && !name.includes("helium")) return false;
		if (wanted === null) return true;
		return name === wanted || name === wanted + " - helium" || name.startsWith(wanted + " - ");
	});
	if (!win) return false;
	win.activate(global.get_current_time());
	return true;
})()`;
}

async function focusGnomeWindow(title?: string): Promise<boolean> {
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
			gnomeActivateScript(title),
		]);
		const match = /^\(true, '(.*)'\)$/.exec(output.trim());
		if (match?.[1] === "true") return true;
	} catch {
		// gdbus missing or the Shell is unreachable; the X11 fallback runs next
	}

	return false;
}

async function focusWithX11Tools(title?: string): Promise<boolean> {
	if (title?.trim()) {
		// xdotool can combine the Helium class with a title regex.
		try {
			const ids = (
				await runCommand("xdotool", [
					"search",
					"--class",
					"helium",
					"--name",
					escapeRegExp(`${title.trim()} - Helium`),
				])
			)
				.split("\n")
				.filter((id) => id.trim() !== "");
			const [id] = ids;
			if (id) {
				await runCommand("xdotool", ["windowactivate", id]);
				return true;
			}
		} catch {
			// no matching window or xdotool unavailable
		}

		// wmctrl matches the window title as a substring.
		try {
			await runCommand("wmctrl", ["-a", `${title.trim()} - Helium`]);
			return true;
		} catch {
			// no matching window or wmctrl unavailable
		}

		return false;
	}

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

async function focusNative(title?: string): Promise<boolean> {
	switch (detectWindowManager()) {
		case "niri":
			return focusNiriWindow(title).catch(() => false);
		case "hyprland":
			return focusHyprlandWindow(title).catch(() => false);
		case "sway":
			return focusSwayWindow("swaymsg", title).catch(() => false);
		case "i3":
			return focusSwayWindow("i3-msg", title).catch(() => false);
		case "kde":
			return focusKdeWindow(title).catch(() => false);
		case "gnome":
			return focusGnomeWindow(title).catch(() => false);
		default:
			return false;
	}
}

/**
 * Bring the Helium window to the foreground. Wayland clients cannot raise
 * themselves, so this asks Vicinae's window management service first and then
 * falls back to the running compositor's own interface: niri, Hyprland,
 * sway/i3, KDE (kdotool) and GNOME are handled natively, with `wmctrl` and
 * `xdotool` as a generic X11 fallback.
 *
 * Pass the selected tab's title to target the window that owns that tab when
 * several Helium windows are open. Title updates can lag a moment behind tab
 * activation, so title-based lookups are retried briefly.
 */
export async function activeWindow(title?: string): Promise<boolean> {
	const attempts = title?.trim() ? 5 : 1;

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		if (attempt > 0) await delay(100);

		if (await focusViaWindowManagement(title)) return true;
		if (await focusNative(title)) return true;
		if (await focusWithX11Tools(title).catch(() => false)) return true;
	}

	return false;
}
