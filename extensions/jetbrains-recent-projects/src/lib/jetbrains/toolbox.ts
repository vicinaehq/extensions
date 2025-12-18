import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { IdeSpec } from "./ide-specs";

async function pathExists(p: string): Promise<boolean> {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
}

async function findFirstExisting(candidates: string[]): Promise<string | null> {
	const results = await Promise.all(
		candidates.map(async (c) => ({ path: c, exists: await pathExists(c) })),
	);
	return results.find((r) => r.exists)?.path ?? null;
}

export async function findToolboxScriptsDir(
	homeDir: string = process.env.HOME ?? "",
): Promise<string | null> {
	if (!homeDir) return null;

	const candidates = [
		path.join(homeDir, ".local/share/JetBrains/Toolbox/scripts"),
		path.join(homeDir, ".local/share/JetBrains/Toolbox/bin"),
		path.join(homeDir, ".config/JetBrains/Toolbox/scripts"),
	];
	return findFirstExisting(candidates);
}

export async function findToolboxAppsBaseDir(
	homeDir: string = process.env.HOME ?? "",
): Promise<string | null> {
	if (!homeDir) return null;

	const candidates = [
		path.join(homeDir, ".local/share/JetBrains/Toolbox/apps"),
	];
	return findFirstExisting(candidates);
}

export async function findToolboxScriptPath(
	scriptsDir: string | null,
	scriptNames: string[],
): Promise<string | undefined> {
	if (!scriptsDir || scriptNames.length === 0) return undefined;

	const candidates = scriptNames.map((name) => path.join(scriptsDir, name));
	const existing = await findFirstExisting(candidates);
	return existing ?? undefined;
}

async function findNewestToolboxAppBin(
	appsBase: string | null,
	appCodes: string[],
): Promise<string | undefined> {
	if (!appsBase || appCodes.length === 0) return undefined;

	const codeDirResults = await Promise.all(
		appCodes.map(async (code) => {
			const codeDir = path.join(appsBase, code);
			return { code, codeDir, exists: await pathExists(codeDir) };
		}),
	);

	for (const { codeDir, exists } of codeDirResults) {
		if (!exists) continue;

		let channels: string[] = [];
		try {
			channels = await readdir(codeDir);
		} catch {
			continue;
		}

		const channelVersions = await Promise.all(
			channels.map(async (channel) => {
				const channelDir = path.join(codeDir, channel);
				let versions: string[] = [];
				try {
					versions = await readdir(channelDir);
				} catch {
					return [];
				}

				const versionResults = await Promise.all(
					versions.map(async (v) => {
						const vDir = path.join(channelDir, v);
						const binDir = path.join(vDir, "bin");
						try {
							const [vStat, binExists] = await Promise.all([
								stat(vDir),
								pathExists(binDir),
							]);
							if (binExists) return { mtimeMs: vStat.mtimeMs, binDir };
						} catch {
							return null;
						}
						return null;
					}),
				);
				return versionResults.filter(
					(r): r is { mtimeMs: number; binDir: string } => r !== null,
				);
			}),
		);

		const versionBins = channelVersions.flat();
		versionBins.sort((a, b) => b.mtimeMs - a.mtimeMs);

		for (const { binDir } of versionBins) {
			try {
				const files = await readdir(binDir);
				const sh = files.find((x) => x.endsWith(".sh"));
				if (sh) return path.join(binDir, sh);
			} catch {
				continue;
			}
		}
	}
	return undefined;
}

export async function resolveToolboxLauncher(
	spec: IdeSpec,
	homeDir: string = process.env.HOME ?? "",
	overrides?: { toolboxScriptsDir?: string; toolboxAppsDir?: string },
): Promise<{ toolboxScriptPath?: string; toolboxAppPath?: string }> {
	const [scriptsDir, appsBase] = await Promise.all([
		overrides?.toolboxScriptsDir
			? Promise.resolve(overrides.toolboxScriptsDir)
			: findToolboxScriptsDir(homeDir),
		overrides?.toolboxAppsDir
			? Promise.resolve(overrides.toolboxAppsDir)
			: findToolboxAppsBaseDir(homeDir),
	]);

	const toolboxScriptPath = await findToolboxScriptPath(
		scriptsDir,
		spec.toolboxScriptNames,
	);
	const toolboxAppPath = toolboxScriptPath
		? undefined
		: await findNewestToolboxAppBin(appsBase, spec.toolboxAppCodes);

	return { toolboxScriptPath, toolboxAppPath };
}

export async function resolveToolboxLaunchersBatch(
	specs: IdeSpec[],
	homeDir: string = process.env.HOME ?? "",
	overrides?: { toolboxScriptsDir?: string; toolboxAppsDir?: string },
): Promise<
	Map<string, { toolboxScriptPath?: string; toolboxAppPath?: string }>
> {
	const results = await Promise.all(
		specs.map(async (spec) => ({
			ideId: spec.ideId,
			launcher: await resolveToolboxLauncher(spec, homeDir, overrides),
		})),
	);

	const map = new Map<
		string,
		{ toolboxScriptPath?: string; toolboxAppPath?: string }
	>();
	for (const { ideId, launcher } of results) {
		map.set(ideId, launcher);
	}
	return map;
}
