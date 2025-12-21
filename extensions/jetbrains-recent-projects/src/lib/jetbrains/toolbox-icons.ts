import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { IdeId } from "../types";

type ToolboxIconsIndex = Map<IdeId, string>;

const IDE_PREFIXES: Record<IdeId, string[]> = {
	idea: ["jetbrains-idea-"],
	pycharm: ["jetbrains-pycharm-"],
	webstorm: ["jetbrains-webstorm-"],
	goland: ["jetbrains-goland-"],
	clion: ["jetbrains-clion-"],
	datagrip: ["jetbrains-datagrip-"],
	phpstorm: ["jetbrains-phpstorm-"],
	rubymine: ["jetbrains-rubymine-"],
	rider: ["jetbrains-rider-"],
	rustrover: ["jetbrains-rustrover-"],
	aqua: ["jetbrains-aqua-"],
	unknown: [],
};

function getDotDesktopIconsDir(homeDir: string): string {
	return path.join(homeDir, ".local/share/JetBrains/Toolbox/dotDesktopIcons");
}

async function buildIndex(dir: string): Promise<ToolboxIconsIndex> {
	let files: string[] = [];
	try {
		files = await readdir(dir);
	} catch {
		return new Map();
	}

	const relevantFiles = files.filter((f) => f.endsWith(".desktop.icon.svg"));
	if (relevantFiles.length === 0) return new Map();

	const fileStats = await Promise.all(
		relevantFiles.map(async (f) => {
			const absPath = path.join(dir, f);
			try {
				const s = await stat(absPath);
				return { file: f, absPath, mtimeMs: s.mtimeMs };
			} catch {
				return null;
			}
		}),
	);

	const validStats = fileStats.filter(
		(s): s is { file: string; absPath: string; mtimeMs: number } => s !== null,
	);

	const byIde = new Map<IdeId, Array<{ mtimeMs: number; absPath: string }>>();

	for (const { file, absPath, mtimeMs } of validStats) {
		for (const [ideId, prefixes] of Object.entries(IDE_PREFIXES) as Array<
			[IdeId, string[]]
		>) {
			if (prefixes.some((p) => file.startsWith(p))) {
				const list = byIde.get(ideId) ?? [];
				list.push({ mtimeMs, absPath });
				byIde.set(ideId, list);
				break;
			}
		}
	}

	const index: ToolboxIconsIndex = new Map();
	for (const [ideId, list] of byIde.entries()) {
		list.sort((a, b) => b.mtimeMs - a.mtimeMs);
		if (list[0]) index.set(ideId, list[0].absPath);
	}

	return index;
}

export async function getToolboxIconsIndex(options?: {
	homeDir?: string;
	dotDesktopIconsDir?: string;
}): Promise<ToolboxIconsIndex> {
	const homeDir = options?.homeDir ?? process.env.HOME ?? "";
	if (!homeDir) return new Map();

	const dir = options?.dotDesktopIconsDir ?? getDotDesktopIconsDir(homeDir);
	return buildIndex(dir);
}

export async function getToolboxIdeIconPath(
	ideId: IdeId,
	options?: { homeDir?: string; dotDesktopIconsDir?: string },
): Promise<string | undefined> {
	const index = await getToolboxIconsIndex(options);
	return index.get(ideId);
}

export async function getToolboxIdeIconPaths(
	ideIds: IdeId[],
	options?: { homeDir?: string; dotDesktopIconsDir?: string },
): Promise<Map<IdeId, string>> {
	const index = await getToolboxIconsIndex(options);
	const result = new Map<IdeId, string>();

	for (const ideId of ideIds) {
		const iconPath = index.get(ideId);
		if (iconPath) result.set(ideId, iconPath);
	}

	return result;
}
