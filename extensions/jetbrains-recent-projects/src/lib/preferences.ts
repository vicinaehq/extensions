import path from "node:path";
import { getPreferenceValues } from "@vicinae/api";

export type Preferences = {
	toolboxAppsDirInput?: string;
	toolboxScriptsDirInput?: string;
};

function expandPath(
	input: string | undefined,
	homeDir: string,
): string | undefined {
	if (!input) return undefined;
	const s = input.trim();
	if (!s) return undefined;
	if (s.startsWith("$HOME/"))
		return path.join(homeDir, s.slice("$HOME/".length));
	if (s === "$HOME") return homeDir;
	if (s.startsWith("~")) return path.join(homeDir, s.slice(1));
	return s;
}

export function getResolvedPreferences(
	homeDir: string = process.env.HOME ?? "",
): {
	homeDir: string;
	toolboxAppsDir?: string;
	toolboxScriptsDir?: string;
	toolboxRootDir?: string;
	dotDesktopIconsDir?: string;
} {
	const prefs = getPreferenceValues<Preferences>();

	const appsDir = expandPath(prefs.toolboxAppsDirInput, homeDir);
	const scriptsDir = expandPath(prefs.toolboxScriptsDirInput, homeDir);

	const rootFromScripts = scriptsDir ? path.dirname(scriptsDir) : undefined;
	const rootFromApps = appsDir ? path.dirname(appsDir) : undefined;
	const toolboxRootDir = rootFromScripts ?? rootFromApps;
	const dotDesktopIconsDir = toolboxRootDir
		? path.join(toolboxRootDir, "dotDesktopIcons")
		: undefined;

	return {
		homeDir,
		toolboxAppsDir: appsDir,
		toolboxScriptsDir: scriptsDir,
		toolboxRootDir,
		dotDesktopIconsDir,
	};
}
