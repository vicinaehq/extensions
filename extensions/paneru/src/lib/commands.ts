// Single source of truth for every Paneru command this extension exposes.
//
// Mirrors Paneru's argv vocabulary (src/types/argv.rs upstream), i.e. every
// action that can be bound in `[bindings]` or sent with `paneru send-cmd`.
//
// This file must stay free of runtime imports: `scripts/generate.mts` imports it
// under plain Node to regenerate `package.json` commands and `src/<name>.ts`
// entrypoints. Run `npm run generate` after editing.

import type { Icon } from "@vicinae/api";

export type IconName = keyof typeof Icon;

export interface PaneruCommand {
	/** Vicinae command name; also the entrypoint file `src/<name>.ts`. */
	name: string;
	title: string;
	description: string;
	section: string;
	icon: IconName;
	/** Arguments passed to `paneru send-cmd`. */
	argv: string[];
	/**
	 * When set, the command takes a required numeric argument (column or
	 * virtual workspace number) that is appended to `argv`.
	 */
	numberArg?: { placeholder: string };
	keywords?: string[];
	/** Message shown after success (otherwise the command is silent). */
	successHud?: string;
}

type Dir = "west" | "east" | "north" | "south" | "first" | "last";

const DIRS: { dir: Dir; label: string; icon: IconName }[] = [
	{ dir: "west", label: "Left", icon: "ArrowLeft" },
	{ dir: "east", label: "Right", icon: "ArrowRight" },
	{ dir: "north", label: "Up", icon: "ArrowUp" },
	{ dir: "south", label: "Down", icon: "ArrowDown" },
	{ dir: "first", label: "First", icon: "ChevronLeft" },
	{ dir: "last", label: "Last", icon: "ChevronRight" },
];

const dirKeywords = (dir: Dir) => [
	dir,
	...(dir === "west" ? ["left", "h"] : []),
	...(dir === "east" ? ["right", "l"] : []),
	...(dir === "north" ? ["up", "above", "k"] : []),
	...(dir === "south" ? ["down", "below", "j"] : []),
	...(dir === "first" ? ["start", "leftmost", "home"] : []),
	...(dir === "last" ? ["end", "rightmost"] : []),
];

// Virtual workspace verbs take north/south/first/last (east/west are aliases).
const VIRTUAL_DIRS = DIRS.filter(
	(d) => d.dir !== "west" && d.dir !== "east",
).map((d) => ({
	...d,
	label: d.dir === "north" ? "Previous" : d.dir === "south" ? "Next" : d.label,
	icon: (d.dir === "north"
		? "ArrowUp"
		: d.dir === "south"
			? "ArrowDown"
			: d.dir === "first"
				? "ChevronUp"
				: "ChevronDown") as IconName,
}));

const FOCUS = "Focus";
const MOVE = "Move";
const SIZE = "Size & Layout";
const STACK = "Stacks";
const DISPLAY = "Displays";
const VIRTUAL = "Virtual Workspaces";
const FLOAT = "Floating Windows";
const APP = "Paneru";

export const COMMANDS: PaneruCommand[] = [
	// ── Focus ────────────────────────────────────────────────────────────────
	...DIRS.map(
		({ dir, label, icon }): PaneruCommand => ({
			name: `window-focus-${dir}`,
			title: `Focus Window ${label}`,
			description:
				dir === "north" || dir === "south"
					? `Focus the window ${label.toLowerCase()} in the stack, or the display in that direction.`
					: dir === "first" || dir === "last"
						? `Jump to the ${label.toLowerCase()} window in the strip.`
						: `Focus the window to the ${label.toLowerCase()}.`,
			section: FOCUS,
			icon,
			argv: ["window", "focus", dir],
			keywords: ["focus", ...dirKeywords(dir)],
		}),
	),
	{
		name: "window-focus-number",
		title: "Focus Window by Column Number",
		description: "Focus the Nth column, counting from 1 on the left.",
		section: FOCUS,
		icon: "Hashtag",
		argv: ["window", "focus"],
		numberArg: { placeholder: "Column" },
		keywords: ["focus", "column", "index", "nth", "jump"],
	},
	{
		name: "window-focus-managed",
		title: "Focus Last Tiled Window",
		description:
			"Focus the previously focused managed (tiled) window on this workspace.",
		section: FOCUS,
		icon: "AppWindowGrid2x2",
		argv: ["window", "focus", "managed"],
		keywords: ["focus", "managed", "tiled", "previous"],
	},
	{
		name: "window-focus-unmanaged",
		title: "Focus Last Floating Window",
		description:
			"Focus the previously focused floating window on this workspace.",
		section: FOCUS,
		icon: "AppWindow",
		argv: ["window", "focus", "unmanaged"],
		keywords: ["focus", "unmanaged", "floating", "previous"],
	},

	// ── Move / swap ──────────────────────────────────────────────────────────
	...DIRS.map(
		({ dir, label, icon }): PaneruCommand => ({
			name: `window-swap-${dir}`,
			title: `Swap Window ${label}`,
			description:
				dir === "north" || dir === "south"
					? `Swap the window ${label.toLowerCase()} in the stack, or move it to the display in that direction.`
					: dir === "first" || dir === "last"
						? `Move the focused window to the ${dir === "first" ? "start" : "end"} of the strip.`
						: `Swap the focused window with its ${label.toLowerCase()} neighbour.`,
			section: MOVE,
			icon,
			argv: ["window", "swap", dir],
			keywords: ["swap", "move", ...dirKeywords(dir)],
		}),
	),

	// ── Size & layout ────────────────────────────────────────────────────────
	{
		name: "window-center",
		title: "Center Window",
		description: "Center the focused window in the viewport.",
		section: SIZE,
		icon: "Center",
		argv: ["window", "center"],
		keywords: ["center", "middle"],
	},
	{
		name: "window-grow",
		title: "Grow Window Width",
		description: "Cycle the focused window to the next preset column width.",
		section: SIZE,
		icon: "ArrowsExpand",
		argv: ["window", "resize", "grow"],
		keywords: ["resize", "grow", "wider", "width", "preset"],
	},
	{
		name: "window-shrink",
		title: "Shrink Window Width",
		description:
			"Cycle the focused window to the previous preset column width.",
		section: SIZE,
		icon: "ArrowsContract",
		argv: ["window", "resize", "shrink"],
		keywords: ["resize", "shrink", "narrower", "width", "preset"],
	},
	{
		name: "window-vertical-grow",
		title: "Grow Window Height",
		description: "Cycle a stacked window to the next preset height.",
		section: SIZE,
		icon: "ChevronUp",
		argv: ["window", "vertical", "resize", "grow"],
		keywords: ["resize", "vertical", "grow", "taller", "height", "stack"],
	},
	{
		name: "window-vertical-shrink",
		title: "Shrink Window Height",
		description: "Cycle a stacked window to the previous preset height.",
		section: SIZE,
		icon: "ChevronDown",
		argv: ["window", "vertical", "resize", "shrink"],
		keywords: ["resize", "vertical", "shrink", "shorter", "height", "stack"],
	},
	{
		name: "window-fullwidth",
		title: "Toggle Full Width",
		description: "Toggle full-width mode for the focused window.",
		section: SIZE,
		icon: "Maximize",
		argv: ["window", "fullwidth"],
		keywords: ["fullwidth", "maximize", "full", "width"],
	},
	{
		name: "window-balance",
		title: "Balance Columns",
		description:
			"Make all columns in the strip match the focused window's width.",
		section: SIZE,
		icon: "BarChart",
		argv: ["window", "balance"],
		keywords: ["balance", "equal", "width", "columns"],
	},
	{
		name: "window-snap",
		title: "Snap Window into View",
		description:
			"Resize and reposition an overflowing window to fit the visible viewport.",
		section: SIZE,
		icon: "Minimize",
		argv: ["window", "snap"],
		keywords: ["snap", "fit", "viewport", "overflow"],
	},

	// ── Stacks ───────────────────────────────────────────────────────────────
	{
		name: "window-stack",
		title: "Stack Window",
		description: "Stack the focused window onto the column to its left.",
		section: STACK,
		icon: "AppWindowList",
		argv: ["window", "stack"],
		keywords: ["stack", "column", "merge"],
	},
	{
		name: "window-unstack",
		title: "Unstack Window",
		description:
			"Pull the focused window out of its stack into its own column.",
		section: STACK,
		icon: "AppWindowSidebarLeft",
		argv: ["window", "unstack"],
		keywords: ["unstack", "column", "split"],
	},
	{
		name: "window-equalize",
		title: "Equalize Stack Heights",
		description: "Give all windows in the focused stack equal height.",
		section: STACK,
		icon: "AppWindowGrid3x3",
		argv: ["window", "equalize"],
		keywords: ["equalize", "equal", "height", "stack"],
	},
	{
		name: "window-tabbeddisplay",
		title: "Toggle Tabbed Stack",
		description: "Toggle the focused stack between split and tabbed display.",
		section: STACK,
		icon: "Layers",
		argv: ["window", "tabbeddisplay"],
		keywords: ["tabbed", "tabs", "stack", "monocle"],
	},

	// ── Displays ─────────────────────────────────────────────────────────────
	{
		name: "window-nextdisplay",
		title: "Move Window to Next Display",
		description: "Move the focused window to the next display and follow it.",
		section: DISPLAY,
		icon: "Monitor",
		argv: ["window", "nextdisplay"],
		keywords: ["display", "monitor", "screen", "move", "follow"],
	},
	{
		name: "window-nextdisplaysend",
		title: "Send Window to Next Display",
		description: "Move the focused window to the next display but stay here.",
		section: DISPLAY,
		icon: "Monitor",
		argv: ["window", "nextdisplaysend"],
		keywords: ["display", "monitor", "screen", "send", "stay"],
	},
	{
		name: "mouse-nextdisplay",
		title: "Move Mouse to Next Display",
		description: "Warp the mouse pointer to the next display.",
		section: DISPLAY,
		icon: "Mouse",
		argv: ["mouse", "nextdisplay"],
		keywords: ["mouse", "pointer", "cursor", "display", "monitor", "warp"],
	},

	// ── Virtual workspaces ───────────────────────────────────────────────────
	...VIRTUAL_DIRS.map(
		({ dir, label, icon }): PaneruCommand => ({
			name: `window-virtual-${dir}`,
			title: `Switch to ${label} Virtual Workspace`,
			description: `Switch to the ${label.toLowerCase()} virtual workspace row.`,
			section: VIRTUAL,
			icon,
			argv: ["window", "virtual", dir],
			keywords: ["virtual", "workspace", "row", "switch", ...dirKeywords(dir)],
		}),
	),
	...VIRTUAL_DIRS.filter((d) => d.dir === "north" || d.dir === "south").map(
		({ dir, label, icon }): PaneruCommand => ({
			name: `window-virtualfocus-${dir}`,
			title: `Focus ${label === "Previous" ? "Up" : "Down"} or Switch Virtual Workspace`,
			description: `Focus the stacked window ${dir === "north" ? "above" : "below"}, or switch to the ${label.toLowerCase()} virtual workspace if there is none.`,
			section: VIRTUAL,
			icon,
			argv: ["window", "virtualfocus", dir],
			keywords: ["virtual", "workspace", "focus", ...dirKeywords(dir)],
		}),
	),
	{
		name: "window-virtualnum",
		title: "Switch to Virtual Workspace…",
		description: "Switch directly to a numbered virtual workspace.",
		section: VIRTUAL,
		icon: "Hashtag",
		argv: ["window", "virtualnum"],
		numberArg: { placeholder: "Workspace" },
		keywords: ["virtual", "workspace", "number", "switch", "go"],
	},
	{
		name: "window-virtualadd",
		title: "New Virtual Workspace",
		description:
			"Create a new empty virtual workspace after the last one and switch to it.",
		section: VIRTUAL,
		icon: "Plus",
		argv: ["window", "virtualadd"],
		keywords: ["virtual", "workspace", "add", "new", "create"],
	},
	...VIRTUAL_DIRS.map(
		({ dir, label, icon }): PaneruCommand => ({
			name: `window-virtualmove-${dir}`,
			title: `Move Window to ${label} Virtual Workspace`,
			description: `Move the focused window to the ${label.toLowerCase()} virtual workspace and follow it.`,
			section: VIRTUAL,
			icon,
			argv: ["window", "virtualmove", dir],
			keywords: ["virtual", "workspace", "move", "follow", ...dirKeywords(dir)],
		}),
	),
	{
		name: "window-virtualmovenum",
		title: "Move Window to Virtual Workspace…",
		description:
			"Move the focused window to a numbered virtual workspace and follow it.",
		section: VIRTUAL,
		icon: "Hashtag",
		argv: ["window", "virtualmovenum"],
		numberArg: { placeholder: "Workspace" },
		keywords: ["virtual", "workspace", "move", "follow", "number"],
	},
	...VIRTUAL_DIRS.map(
		({ dir, label, icon }): PaneruCommand => ({
			name: `window-virtualsend-${dir}`,
			title: `Send Window to ${label} Virtual Workspace`,
			description: `Send the focused window to the ${label.toLowerCase()} virtual workspace but stay here.`,
			section: VIRTUAL,
			icon,
			argv: ["window", "virtualsend", dir],
			keywords: ["virtual", "workspace", "send", "stay", ...dirKeywords(dir)],
		}),
	),
	{
		name: "window-virtualsendnum",
		title: "Send Window to Virtual Workspace…",
		description:
			"Send the focused window to a numbered virtual workspace but stay here.",
		section: VIRTUAL,
		icon: "Hashtag",
		argv: ["window", "virtualsendnum"],
		numberArg: { placeholder: "Workspace" },
		keywords: ["virtual", "workspace", "send", "stay", "number"],
	},

	// ── Floating windows ─────────────────────────────────────────────────────
	{
		name: "window-manage",
		title: "Toggle Floating",
		description: "Toggle the focused window between tiled and floating.",
		section: FLOAT,
		icon: "Pin",
		argv: ["window", "manage"],
		keywords: ["manage", "float", "floating", "tile", "unmanage"],
	},
	{
		name: "window-raise-floating",
		title: "Raise Floating Windows",
		description:
			"Bring floating windows on this display to the front and focus the last one.",
		section: FLOAT,
		icon: "Eye",
		argv: ["window", "raise", "floating"],
		keywords: ["raise", "floating", "front", "show"],
	},
	{
		name: "window-togglefloatlayer",
		title: "Toggle Floating Layer",
		description:
			"Switch between the floating and tiled layers of this workspace.",
		section: FLOAT,
		icon: "Switch",
		argv: ["window", "togglefloatlayer"],
		keywords: ["floating", "layer", "toggle", "tiled", "front", "behind"],
	},
	{
		name: "window-copyrule",
		title: "Copy Window Rule",
		description:
			"Copy a [windows] configuration rule template for the focused window.",
		section: FLOAT,
		icon: "CopyClipboard",
		argv: ["window", "copyrule"],
		keywords: ["copy", "rule", "config", "clipboard", "window rule"],
		successHud: "Copied window rule to clipboard",
	},

	// ── Paneru itself ────────────────────────────────────────────────────────
	{
		name: "paneru-showmenu",
		title: "Show Menu Bar Item",
		description: "Show the Paneru menu bar item and remember the choice.",
		section: APP,
		icon: "Eye",
		argv: ["showmenu"],
		keywords: ["menu", "menubar", "show", "status"],
		successHud: "Paneru menu bar item shown",
	},
	{
		name: "paneru-hidemenu",
		title: "Hide Menu Bar Item",
		description: "Hide the Paneru menu bar item and remember the choice.",
		section: APP,
		icon: "EyeDisabled",
		argv: ["hidemenu"],
		keywords: ["menu", "menubar", "hide", "status"],
		successHud: "Paneru menu bar item hidden",
	},
	{
		name: "paneru-printstate",
		title: "Print Debug State",
		description: "Print Paneru's internal ECS state to its debug log.",
		section: APP,
		icon: "Bug",
		argv: ["printstate"],
		keywords: ["debug", "state", "log", "print"],
		successHud: "Paneru state printed to log",
	},
	{
		name: "paneru-restart",
		title: "Restart Paneru",
		description: "Restart the Paneru service.",
		section: APP,
		icon: "ArrowClockwise",
		argv: ["restart"],
		keywords: ["restart", "reload", "service"],
		successHud: "Restarting Paneru",
	},
	{
		name: "paneru-quit",
		title: "Quit Paneru",
		description: "Quit Paneru.",
		section: APP,
		icon: "Power",
		argv: ["quit"],
		keywords: ["quit", "exit", "stop"],
		successHud: "Quit Paneru",
	},
];

export const SECTIONS = [
	FOCUS,
	MOVE,
	SIZE,
	STACK,
	DISPLAY,
	VIRTUAL,
	FLOAT,
	APP,
];

export function findCommand(name: string): PaneruCommand {
	const command = COMMANDS.find((c) => c.name === name);
	if (!command) throw new Error(`Unknown Paneru command: ${name}`);
	return command;
}
