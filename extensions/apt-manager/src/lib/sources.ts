import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "./exec";

export const SOURCES_LIST = "/etc/apt/sources.list";
export const SOURCES_LIST_D = "/etc/apt/sources.list.d";

export type RepoSource = {
	/** Stable unique id built from file path + block index. */
	id: string;
	/** Absolute path of the file that holds this source. */
	file: string;
	format: "legacy" | "deb822";
	enabled: boolean;
	types: string[];
	uris: string[];
	suites: string[];
	components: string[];
	signedBy: string | null;
	/** Exact source of the block within the file (line for legacy, stanza for deb822). */
	raw: string;
	/** 0-based start line of the block inside the file. */
	startLine: number;
	/** 0-based exclusive end line of the block inside the file. */
	endLine: number;
};

export type ParsedFile = {
	path: string;
	content: string;
	blocks: Array<{ start: number; end: number }>;
};

export type ReposState = {
	sources: RepoSource[];
	files: ParsedFile[];
	error: string | null;
};

function readSafely(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

/**
 * Detect whether a sources file uses the deb822 or the legacy one-line format
 * by looking at the first non-comment, non-blank field line.
 */
function detectFormat(content: string): "legacy" | "deb822" {
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		if (/^deb(?:-src)?(\s|$)/.test(trimmed)) return "legacy";
		if (
			/^(Types|URIs|Suites|Components|Enabled|Architectures|Signed-By|Description):/i.test(
				trimmed,
			)
		) {
			return "deb822";
		}
	}
	return "legacy";
}

function sourcesFileCandidates(): string[] {
	const candidates = [SOURCES_LIST];
	try {
		for (const entry of readdirSync(SOURCES_LIST_D)) {
			if (entry.endsWith(".list") || entry.endsWith(".sources")) {
				candidates.push(join(SOURCES_LIST_D, entry));
			}
		}
	} catch {
		// directory does not exist (unlikely on Debian/Ubuntu systems)
	}
	return candidates;
}

export function loadRepos(): ReposState {
	const files: ParsedFile[] = [];
	const sources: RepoSource[] = [];
	let error: string | null = null;

	for (const path of sourcesFileCandidates()) {
		const content = readSafely(path);
		if (content === null) continue;

		const lines = content.split("\n");
		const file: ParsedFile = { path, content, blocks: [] };

		// `.sources` files are always deb822; the main sources.list file may be
		// either format depending on the distribution, so detect by content.
		const isDeb822 =
			path.endsWith(".sources") ||
			(path === SOURCES_LIST && detectFormat(content) === "deb822");

		if (isDeb822) {
			parseDeb822File(file, lines, sources);
		} else {
			parseLegacyFile(file, lines, sources);
		}

		if (file.blocks.length > 0) files.push(file);
	}

	if (sources.length === 0) {
		error = "No repositories found. Make sure /etc/apt/sources.list exists.";
	}

	return { sources, files, error };
}

function parseDeb822File(
	file: ParsedFile,
	lines: string[],
	sources: RepoSource[],
) {
	const KEYS = new Set([
		"types",
		"uris",
		"suites",
		"components",
		"signed-by",
		"enabled",
	]);
	let stanza: {
		start: number;
		fields: Map<string, string[]>;
		commented: boolean;
	} | null = null;

	const flush = () => {
		if (!stanza) return;
		const end = findStanzaEnd(lines, stanza.start);
		const raw = lines.slice(stanza.start, end).join("\n");
		sources.push(
			buildSource(
				file.path,
				"deb822",
				stanza.start,
				end,
				stanza.fields,
				raw,
				stanza.commented ? false : undefined,
			),
		);
		file.blocks.push({ start: stanza.start, end });
		stanza = null;
	};

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const trimmed = line.trim();
		const isComment = trimmed.startsWith("#");
		// A fully commented stanza (`#Types: deb`, …) is a disabled source.
		const content = isComment ? trimmed.replace(/^#+\s*/, "") : trimmed;
		if (content.includes(":")) {
			const key = content.slice(0, content.indexOf(":")).trim().toLowerCase();
			if (KEYS.has(key)) {
				if (!stanza) {
					stanza = { start: index, fields: new Map(), commented: isComment };
				} else if (!isComment) {
					stanza.commented = false;
				}
				const existing = stanza.fields.get(key) ?? [];
				existing.push(content.slice(content.indexOf(":") + 1).trim());
				stanza.fields.set(key, existing);
				continue;
			}
		}
		// A blank line or a new block that begins with a fresh key boundaries a stanza.
		if (line.trim() === "" && stanza) flush();
	}
	if (stanza) flush();
}

function findStanzaEnd(lines: string[], start: number): number {
	let end = start;
	while (end < lines.length) {
		if (lines[end].trim() === "") break;
		end += 1;
	}
	return end;
}

function parseLegacyFile(
	file: ParsedFile,
	lines: string[],
	sources: RepoSource[],
) {
	for (let index = 0; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		// Match `deb`/`deb-src` lines, including commented-out (disabled) ones.
		const match = /^(\#+\s*)?(deb(?:-src)?)(\s|$)/.exec(trimmed);
		if (!match) continue;
		const disabled = match[1] !== undefined && match[1] !== "";
		const content = disabled ? trimmed.slice(match[1].length) : trimmed;
		const fields = parseLegacyLine(content);
		if (fields) {
			const endLine = index + 1;
			sources.push(
				buildSource(
					file.path,
					"legacy",
					index,
					endLine,
					fields,
					trimmed,
					disabled ? false : undefined,
				),
			);
			file.blocks.push({ start: index, end: endLine });
		}
	}
}

function parseLegacyLine(line: string): Map<string, string[]> | null {
	const headerMatch = /^(deb(?:-src)?)/.exec(line);
	if (!headerMatch) return null;

	let rest = line.slice(headerMatch[1].length).trim();
	// Skip global options block, e.g. `[arch=amd64 trusted=yes]`
	if (rest.startsWith("[")) {
		const close = rest.indexOf("]");
		if (close === -1) return null;
		rest = rest.slice(close + 1).trim();
	}

	const tokens = rest.split(/\s+/).filter(Boolean);
	if (tokens.length < 2) return null;

	const fields = new Map<string, string[]>();
	fields.set("types", headerMatch[1] === "deb-src" ? ["deb-src"] : ["deb"]);
	fields.set("uris", [tokens[0]]);
	fields.set("suites", [tokens[1]]);
	fields.set("components", tokens.slice(2));

	return fields;
}

function buildSource(
	file: string,
	format: "legacy" | "deb822",
	startLine: number,
	endLine: number,
	fields: Map<string, string[]>,
	raw: string,
	enabledOverride?: boolean,
): RepoSource {
	const list = (key: string): string[] => fields.get(key) ?? [];
	const enabledValue = (list("enabled")[0] ?? "yes").toLowerCase();
	const enabled = enabledOverride ?? enabledValue === "yes";
	const types = list("types")
		.flatMap((value) => value.split(","))
		.map((v) => v.trim())
		.filter(Boolean);
	const uris = list("uris")
		.flatMap((value) => value.split(","))
		.map((v) => v.trim())
		.filter(Boolean);
	const suites = list("suites")
		.flatMap((value) => value.split(","))
		.map((v) => v.trim())
		.filter(Boolean);
	const components = list("components")
		.flatMap((value) => value.split(","))
		.map((v) => v.trim())
		.filter(Boolean);
	const signedBy = list("signed-by")[0] ?? null;

	return {
		id: `${file}:${startLine}`,
		file,
		format,
		enabled,
		types: types.length > 0 ? types : ["deb"],
		uris,
		suites,
		components,
		signedBy,
		raw,
		startLine,
		endLine,
	};
}

/**
 * Build a deb822 `.sources` stanza for a repository that is about to be added.
 */
export function buildDeb822Source(input: {
	types: string[];
	uri: string;
	suites: string[];
	components: string[];
	signedBy?: string;
	comment?: string;
}): string {
	const lines: string[] = [];
	if (input.comment) lines.push(`# ${input.comment}`);
	lines.push(`Types: ${input.types.join(" ")}`);
	lines.push(`URIs: ${input.uri}`);
	lines.push(`Suites: ${input.suites.join(" ")}`);
	if (input.components.length > 0)
		lines.push(`Components: ${input.components.join(" ")}`);
	if (input.signedBy) lines.push(`Signed-By: ${input.signedBy}`);
	lines.push("Enabled: yes");
	return `${lines.join("\n")}\n`;
}

/**
 * Remove the block spanning [startLine, endLine) from a file's content.
 */
export function removeBlockFromContent(
	content: string,
	startLine: number,
	endLine: number,
): string {
	const lines = content.split("\n");
	const next = [...lines.slice(0, startLine), ...lines.slice(endLine)];
	return next.join("\n");
}

export async function writeFilePrivileged(
	path: string,
	content: string,
): Promise<string | null> {
	const result = await run("pkexec", ["tee", path], {
		input: content,
		timeout: 120_000,
	});
	return result.ok
		? null
		: result.stderr.trim() || result.stdout.trim() || "Failed to write file";
}

export async function deleteFilePrivileged(
	path: string,
): Promise<string | null> {
	const result = await run("pkexec", ["rm", "-f", path], { timeout: 120_000 });
	return result.ok ? null : result.stderr.trim() || "Failed to delete file";
}

/**
 * Apply a set of pending file changes. Empty replacements delete the file,
 * everything else overwrites it via `pkexec tee`.
 */
export async function applyRepoChanges(
	changes: Array<{ path: string; content: string | null }>,
): Promise<Array<{ path: string; ok: boolean; error: string | null }>> {
	const results: Array<{ path: string; ok: boolean; error: string | null }> =
		[];
	for (const change of changes) {
		if (change.content === null || change.content.trim() === "") {
			const error = await deleteFilePrivileged(change.path);
			results.push({ path: change.path, ok: error === null, error });
		} else {
			const error = await writeFilePrivileged(change.path, change.content);
			results.push({ path: change.path, ok: error === null, error });
		}
	}
	return results;
}

export function slugify(input: string): string {
	const slug = input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
	return slug || "custom";
}
