import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { inferIdeFromConfigDirName } from "./ide-specs";
import type { ProjectEntry } from "../types";

type ParsedProjectMeta = { name?: string; lastOpened?: number };

function decodeXmlAttr(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function normalizeProjectPath(raw: string, homeDir: string): string | null {
	if (!raw) return null;
	let s = decodeXmlAttr(raw).trim();

	if (s.startsWith("file://")) s = s.slice(7);
	if (s.startsWith("$USER_HOME$")) s = path.join(homeDir, s.slice(11));
	if (s.startsWith("~")) s = path.join(homeDir, s.slice(1));

	if (!s.startsWith("/")) return null;
	return s;
}

function parseRecentProjectsXml(
	xml: string,
	homeDir: string,
): Map<string, ParsedProjectMeta> {
	const out = new Map<string, ParsedProjectMeta>();

	const recentPathsMatch = xml.match(
		/<option\s+name="recentPaths">([\s\S]*?)<\/option>/,
	);
	const recentBlock = recentPathsMatch?.[1] ?? xml;

	const entryKeyRegex = /<entry\s+key="([^"]+)"/g;
	const optionValueRegex = /<option\s+value="([^"]+)"/g;

	for (const m of recentBlock.matchAll(entryKeyRegex)) {
		const p = normalizeProjectPath(m[1] ?? "", homeDir);
		if (p && !out.has(p)) out.set(p, {});
	}
	for (const m of recentBlock.matchAll(optionValueRegex)) {
		const p = normalizeProjectPath(m[1] ?? "", homeDir);
		if (p && !out.has(p)) out.set(p, {});
	}

	const addInfoMatch = xml.match(
		/<option\s+name="additionalInfo">[\s\S]*?<map>([\s\S]*?)<\/map>[\s\S]*?<\/option>/,
	);
	const addInfoMap = addInfoMatch?.[1];

	if (addInfoMap) {
		const entries = addInfoMap.split(/<entry\s+key="/);
		for (const entryContent of entries) {
			const keyMatch = entryContent.match(/^([^"]+)"/);
			if (!keyMatch) continue;

			const p = normalizeProjectPath(keyMatch[1], homeDir);
			if (!p) continue;
			if (entryContent.includes('hidden="true"')) continue;

			const prev = out.get(p) ?? {};
			let name = prev.name;
			let lastOpened = prev.lastOpened;

			const displayNameMatch = entryContent.match(/displayName="([^"]+)"/);
			if (displayNameMatch) name = decodeXmlAttr(displayNameMatch[1]).trim();

			const projectNameMatch = entryContent.match(
				/<option\s+name="projectName"\s+value="([^"]*)"/,
			);
			if (projectNameMatch) name = decodeXmlAttr(projectNameMatch[1]).trim();

			const tsMatches = [
				entryContent.match(
					/<option\s+name="activationTimestamp"\s+value="(\d+)"/,
				),
				entryContent.match(
					/<option\s+name="projectOpenTimestamp"\s+value="(\d+)"/,
				),
				entryContent.match(/<option\s+name="openTimestamp"\s+value="(\d+)"/),
			];

			for (const m of tsMatches) {
				if (m) {
					const ts = Number(m[1]);
					if (Number.isFinite(ts) && ts > (lastOpened ?? 0)) {
						lastOpened = ts;
					}
				}
			}

			out.set(p, { ...prev, name: name || prev.name, lastOpened });
		}
	}

	return out;
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
}

async function safeReadFile(p: string): Promise<string | null> {
	try {
		return await readFile(p, "utf8");
	} catch {
		return null;
	}
}

type ConfigDirInfo = {
	configDirName: string;
	ideId: string;
	ideName: string;
	xmlPaths: string[];
};

export async function loadJetBrainsRecentProjects(
	homeDir: string = process.env.HOME ?? "",
): Promise<ProjectEntry[]> {
	if (!homeDir) return [];

	const configBase = path.join(homeDir, ".config/JetBrains");
	if (!(await pathExists(configBase))) return [];

	let configDirs: string[];
	try {
		configDirs = await readdir(configBase);
	} catch {
		return [];
	}

	const configDirInfos: ConfigDirInfo[] = configDirs.map((configDirName) => {
		const { ideId, ideName } = inferIdeFromConfigDirName(configDirName);
		return {
			configDirName,
			ideId,
			ideName,
			xmlPaths: [
				path.join(configBase, configDirName, "options/recentProjects.xml"),
				path.join(configBase, configDirName, "options/recentSolutions.xml"),
			],
		};
	});

	const allXmlReads = configDirInfos.flatMap((info) =>
		info.xmlPaths.map(async (xmlPath) => ({
			info,
			xmlPath,
			content: await safeReadFile(xmlPath),
		})),
	);

	const xmlResults = await Promise.all(allXmlReads);

	const projects: ProjectEntry[] = [];

	for (const { info, content } of xmlResults) {
		if (!content) continue;

		const meta = parseRecentProjectsXml(content, homeDir);
		for (const [projectPath, metaInfo] of meta.entries()) {
			const title =
				metaInfo.name?.trim() || path.basename(projectPath) || projectPath;
			projects.push({
				id: `${info.ideId}:${projectPath}`,
				projectPath,
				title,
				ideId: info.ideId as ProjectEntry["ideId"],
				ideName: info.ideName,
				configDirName: info.configDirName,
				lastOpened: metaInfo.lastOpened,
				toolboxScriptPath: undefined,
				toolboxAppPath: undefined,
			});
		}
	}

	const byKey = new Map<string, ProjectEntry>();
	for (const p of projects) {
		const key = `${p.ideId}:${p.projectPath}`;
		const existing = byKey.get(key);
		if (!existing || (p.lastOpened ?? 0) > (existing.lastOpened ?? 0)) {
			byKey.set(key, p);
		}
	}

	const out = [...byKey.values()];
	out.sort(
		(a, b) =>
			(b.lastOpened ?? 0) - (a.lastOpened ?? 0) ||
			a.title.localeCompare(b.title),
	);
	return out;
}
