import { execFileSync } from "node:child_process";

export type MonitorInfo = { name: string; description: string };

/**
 * Enumerates outputs by asking the running compositor. Only compositors whose
 * capture backends can target an output by name are worth querying: Spectacle
 * and gnome-screenshot capture the *current* monitor and cannot be pointed at a
 * chosen one, so listing displays under KDE or GNOME would offer a choice that
 * cannot be honoured.
 */
const query = (command: string, args: string[]): string =>
	execFileSync(command, args, { stdio: ["ignore", "pipe", "ignore"] }).toString();

const fromHyprland = (): MonitorInfo[] => {
	const parsed: Array<{ name: string; description: string }> = JSON.parse(
		query("hyprctl", ["monitors", "-j"]),
	);
	return parsed.map((m) => ({ name: m.name, description: m.description ?? "" }));
};

const fromSway = (): MonitorInfo[] => {
	const parsed: Array<{
		name: string;
		make?: string;
		model?: string;
		rect?: { width: number; height: number };
	}> = JSON.parse(query("swaymsg", ["-t", "get_outputs", "-r"]));
	return parsed.map((o) => ({
		name: o.name,
		description:
			[o.make, o.model].filter(Boolean).join(" ") ||
			(o.rect ? `${o.rect.width}x${o.rect.height}` : ""),
	}));
};

const fromNiri = (): MonitorInfo[] => {
	const parsed: Record<
		string,
		{ name: string; make?: string; model?: string }
	> = JSON.parse(query("niri", ["msg", "-j", "outputs"]));
	return Object.values(parsed).map((o) => ({
		name: o.name,
		description: [o.make, o.model].filter(Boolean).join(" "),
	}));
};

const fromWlrRandr = (): MonitorInfo[] => {
	const parsed: Array<{ name: string; description?: string }> = JSON.parse(
		query("wlr-randr", ["--json"]),
	);
	return parsed.map((o) => ({ name: o.name, description: o.description ?? "" }));
};

/**
 * Returns the outputs a name-targeting backend can capture, or an empty list
 * when no compositor here can enumerate them.
 */
export const listMonitors = (): MonitorInfo[] => {
	for (const source of [fromHyprland, fromSway, fromNiri, fromWlrRandr]) {
		try {
			const monitors = source();
			if (monitors.length > 0) return monitors;
		} catch {
			// This compositor is not the one running; try the next.
		}
	}
	return [];
};
