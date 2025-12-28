import path from "node:path";
import { stat } from "node:fs/promises";
import type { ProjectEntry, IdeId } from "../types";
import {
	inferIdeFromConfigDirName,
	IDE_SPECS,
	type IdeSpec,
} from "./ide-specs";
import { loadJetBrainsRecentProjects } from "./recent-projects";
import {
	findToolboxAppsBaseDir,
	findToolboxScriptsDir,
	resolveToolboxLaunchersBatch,
} from "./toolbox";
import { getToolboxIdeIconPaths } from "./toolbox-icons";

export type LoadedProjectData = {
	projects: ProjectEntry[];
	iconPaths: Map<IdeId, string>;
	toolboxScriptsDir: string | null;
	toolboxAppsDir: string | null;
};

export class ToolboxNotFoundError extends Error {
	constructor() {
		super("JetBrains Toolbox not found");
		this.name = "ToolboxNotFoundError";
	}
}

export class InvalidPathError extends Error {
	constructor(path: string, type: string, reason: string) {
		super(`Invalid ${type} path: ${path} - ${reason}`);
		this.name = "InvalidPathError";
	}
}

async function validatePath(p: string): Promise<boolean> {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
}

async function hasAnyToolboxScript(dir: string): Promise<boolean> {
	const scriptNames = IDE_SPECS.flatMap((spec) => spec.toolboxScriptNames);
	for (const name of scriptNames) {
		const candidate = path.join(dir, name);
		try {
			const s = await stat(candidate);
			if (s.isFile()) return true;
		} catch {
		}
	}
	return false;
}

async function hasAnyToolboxApp(dir: string): Promise<boolean> {
	const appCodes = IDE_SPECS.flatMap((spec) => spec.toolboxAppCodes);
	for (const code of appCodes) {
		const candidate = path.join(dir, code);
		try {
			const s = await stat(candidate);
			if (s.isDirectory()) return true;
		} catch {
		}
	}
	return false;
}

async function validateToolboxScriptsDir(dirPath: string): Promise<{ valid: boolean; error?: string }> {
	const exists = await validatePath(dirPath);
	if (!exists) {
		return { valid: false, error: "directory does not exist" };
	}
	
	try {
		const stats = await stat(dirPath);
		if (!stats.isDirectory()) {
			return { valid: false, error: "path is not a directory" };
		}
	} catch {
		return { valid: false, error: "cannot access directory" };
	}

	const hasScript = await hasAnyToolboxScript(dirPath);
	if (!hasScript) {
		return {
			valid: false,
			error: "no JetBrains launcher scripts found in this directory",
		};
	}
	
	return { valid: true };
}

async function validateToolboxAppsDir(dirPath: string): Promise<{ valid: boolean; error?: string }> {
	const exists = await validatePath(dirPath);
	if (!exists) {
		return { valid: false, error: "directory does not exist" };
	}
	
	try {
		const stats = await stat(dirPath);
		if (!stats.isDirectory()) {
			return { valid: false, error: "path is not a directory" };
		}
	} catch {
		return { valid: false, error: "cannot access directory" };
	}

	const hasApp = await hasAnyToolboxApp(dirPath);
	if (!hasApp) {
		return {
			valid: false,
			error: "no JetBrains Toolbox apps found in this directory",
		};
	}
	
	return { valid: true };
}

export async function loadProjectsWithLaunchersAndIcons(options?: {
	homeDir?: string;
	toolboxScriptsDir?: string;
	toolboxAppsDir?: string;
	dotDesktopIconsDir?: string;
}): Promise<LoadedProjectData> {
	const homeDir = options?.homeDir ?? process.env.HOME ?? "";

	if (options?.toolboxScriptsDir) {
		const validation = await validateToolboxScriptsDir(options.toolboxScriptsDir);
		if (!validation.valid) {
			throw new InvalidPathError(
				options.toolboxScriptsDir,
				"Toolbox Scripts Directory",
				validation.error ?? "unknown error",
			);
		}
	}

	if (options?.toolboxAppsDir) {
		const validation = await validateToolboxAppsDir(options.toolboxAppsDir);
		if (!validation.valid) {
			throw new InvalidPathError(
				options.toolboxAppsDir,
				"Toolbox Apps Directory",
				validation.error ?? "unknown error",
			);
		}
	}

	const useManualPaths = options?.toolboxScriptsDir || options?.toolboxAppsDir;

	const [scriptsDir, appsDir] = await Promise.all([
		options?.toolboxScriptsDir
			? Promise.resolve(options.toolboxScriptsDir)
			: useManualPaths
				? Promise.resolve(null)
				: findToolboxScriptsDir(homeDir),
		options?.toolboxAppsDir
			? Promise.resolve(options.toolboxAppsDir)
			: useManualPaths
				? Promise.resolve(null)
				: findToolboxAppsBaseDir(homeDir),
	]);

	if (!scriptsDir && !appsDir) {
		throw new ToolboxNotFoundError();
	}

	const projects = await loadJetBrainsRecentProjects(homeDir);

	if (projects.length === 0) {
		return {
			projects: [],
			iconPaths: new Map(),
			toolboxScriptsDir: scriptsDir,
			toolboxAppsDir: appsDir,
		};
	}

	const uniqueIdeIds = [...new Set(projects.map((p) => p.ideId))];
	const specsToResolve = uniqueIdeIds
		.map((ideId) => IDE_SPECS.find((s) => s.ideId === ideId))
		.filter((spec): spec is IdeSpec => spec !== undefined);

	const [launcherMap, iconPaths] = await Promise.all([
		resolveToolboxLaunchersBatch(specsToResolve, homeDir, {
			toolboxScriptsDir: scriptsDir ?? undefined,
			toolboxAppsDir: appsDir ?? undefined,
		}),
		getToolboxIdeIconPaths(uniqueIdeIds, {
			homeDir,
			dotDesktopIconsDir: options?.dotDesktopIconsDir,
		}),
	]);

	const enrichedProjects = projects.map((p) => {
		const launcher = launcherMap.get(p.ideId);
		return {
			...p,
			toolboxScriptPath: launcher?.toolboxScriptPath,
			toolboxAppPath: launcher?.toolboxAppPath,
		};
	});

	return {
		projects: enrichedProjects,
		iconPaths,
		toolboxScriptsDir: scriptsDir,
		toolboxAppsDir: appsDir,
	};
}

export async function loadProjectsWithLaunchers(options?: {
	homeDir?: string;
	toolboxScriptsDir?: string;
	toolboxAppsDir?: string;
}): Promise<ProjectEntry[]> {
	const { projects } = await loadProjectsWithLaunchersAndIcons(options);
	return projects;
}

export { inferIdeFromConfigDirName };
