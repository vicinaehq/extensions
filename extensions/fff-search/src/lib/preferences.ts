import os from "node:os";
import { resolve, sep } from "node:path";
import { getPreferenceValues } from "@vicinae/api";

export type Prefs = {
	roots: string[];
	editorCommand: string;
	editorInTerminal: boolean;
	showPreview: boolean;
	followSymlinks: boolean;
};

export const expandHome = (path: string) =>
	path === "~" || path.startsWith("~/") || path.startsWith("~\\")
		? os.homedir() + path.slice(1)
		: path;

export const tildify = (path: string) => {
	const home = os.homedir();
	return path === home || path.startsWith(`${home}${sep}`)
		? `~${path.slice(home.length)}`
		: path;
};

export function loadPreferences(): Prefs {
	const raw = getPreferenceValues<Preferences>();
	const roots = (raw.roots || "~")
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean)
		.map((r) => resolve(expandHome(r)));

	return {
		roots: [...new Set(roots)],
		editorCommand: (raw.editorCommand ?? "").trim(),
		editorInTerminal: Boolean(raw.editorInTerminal),
		showPreview: raw.showPreview ?? true,
		followSymlinks: Boolean(raw.followSymlinks),
	};
}
