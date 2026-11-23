import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type {
	TomlAssignment,
	TomlDocument,
	TomlTable,
	TomlValue,
} from "./keybinds/toml";
import { parseToml, parseTomlValue } from "./keybinds/toml";
import type { Keybind, Scratchpad } from "./types";

export interface ConfigFile {
	path: string;
	document: TomlDocument;
}

function expandVariables(value: string): string {
	return value.replace(
		/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
		(_, braced, bare) => {
			const name = (braced ?? bare) as string;
			return process.env[name] ?? "";
		},
	);
}

function expandHome(value: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return join(homedir(), value.slice(2));
	return value;
}

function expandPath(value: string): string {
	return expandHome(expandVariables(value));
}

export function getUmbrielConfigPath(): string {
	const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(base, "umbriel", "config.toml");
}

function configCandidates(): string[] {
	const candidates = [getUmbrielConfigPath()];
	const configDirs = (process.env.XDG_CONFIG_DIRS || "/etc/xdg")
		.split(":")
		.filter(Boolean);
	for (const directory of configDirs) {
		candidates.push(join(directory, "umbriel", "config.toml"));
	}
	candidates.push(
		"/usr/local/share/umbriel/config.toml",
		"/usr/share/umbriel/config.toml",
	);
	return candidates;
}

function resolveInclude(target: string, includedFrom: string): string {
	const expanded = expandPath(target);
	return isAbsolute(expanded)
		? expanded
		: resolve(dirname(includedFrom), expanded);
}

function extractHeaderPath(header: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: string | null = null;

	for (const char of header) {
		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === ".") {
			parts.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) parts.push(current.trim());
	return parts;
}

/**
 * A small line-oriented fallback for files the full parser cannot read. It only
 * recovers keybind and scratchpad assignments, which is enough to keep the
 * browse commands useful when a config uses syntax we do not handle yet.
 */
function extractAssignments(source: string): TomlAssignment[] {
	const assignments: TomlAssignment[] = [];
	const lines = source.split(/\r?\n/);
	let section: string[] = [];

	lines.forEach((line, index) => {
		const header = line.match(/^\s*\[\[?(.+?)\]\]?\s*(?:#.*)?$/);
		if (header?.[1]) {
			section = extractHeaderPath(header[1]);
			return;
		}

		if (section[0] !== "keybinds" && section[0] !== "scratchpad") return;

		const match = line.match(
			/^\s*("(?:[^"\\]|\\.)*"|'(?:[^']*)'|[A-Za-z0-9_-]+)\s*=\s*(.+)$/,
		);
		if (!match?.[1] || !match[2]) return;

		let key = match[1];
		if (
			(key.startsWith('"') && key.endsWith('"')) ||
			(key.startsWith("'") && key.endsWith("'"))
		) {
			key = key.slice(1, -1);
		}

		try {
			assignments.push({
				path: [...section, key],
				value: parseTomlValue(match[2]),
				line: index + 1,
				text: `${match[1]} = ${match[2]}`,
			});
		} catch {
			// Skip one unreadable entry rather than hiding the rest of the file.
		}
	});

	return assignments;
}

async function readConfigFile(path: string): Promise<ConfigFile> {
	const source = await readFile(path, "utf8");
	try {
		return { path, document: parseToml(source) };
	} catch {
		return {
			path,
			document: { data: {}, assignments: extractAssignments(source) },
		};
	}
}

function includePaths(data: TomlTable): string[] {
	const paths: string[] = [];
	const include = data.include;
	if (
		typeof include === "object" &&
		include !== null &&
		!Array.isArray(include)
	) {
		const files = (include as TomlTable).files;
		if (Array.isArray(files)) {
			for (const file of files) if (typeof file === "string") paths.push(file);
		}
		const optional = (include as TomlTable).optional;
		if (
			typeof optional === "object" &&
			optional !== null &&
			!Array.isArray(optional)
		) {
			const optionalFiles = (optional as TomlTable).files;
			if (Array.isArray(optionalFiles)) {
				for (const file of optionalFiles)
					if (typeof file === "string") paths.push(file);
			}
		}
	}
	return paths;
}

async function readConfigTree(
	path: string,
	seen: Set<string>,
): Promise<ConfigFile[]> {
	const absolute = resolve(path);
	if (seen.has(absolute)) return [];
	seen.add(absolute);

	const file = await readConfigFile(absolute);
	const included: ConfigFile[] = [];

	for (const target of includePaths(file.document.data)) {
		try {
			included.push(
				...(await readConfigTree(resolveInclude(target, absolute), seen)),
			);
		} catch {
			// Umbriel reports unreadable includes itself. Listing the files we can
			// read is more useful than failing the whole command.
		}
	}

	return [...included, file];
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await readFile(path, "utf8");
		return true;
	} catch {
		return false;
	}
}

export async function loadUmbrielConfig(): Promise<ConfigFile[]> {
	let lastError: unknown;

	for (const candidate of configCandidates()) {
		try {
			if (!(await fileExists(candidate))) continue;
			return await readConfigTree(candidate, new Set());
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error(
				`No Umbriel config found. Looked in ${configCandidates().join(", ")}.`,
			);
}

function isTomlTable(value: TomlValue | undefined): value is TomlTable {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toKeybind(assignment: TomlAssignment, source: string): Keybind | null {
	const rawKey = assignment.path[assignment.path.length - 1];
	if (!rawKey) return null;

	let keys = rawKey;
	let submap: string | null = null;
	const submapMatch = rawKey.match(/^submap\[([^\]]+)\],(.+)$/);
	if (submapMatch?.[1] && submapMatch[2]) {
		submap = submapMatch[1];
		keys = submapMatch[2];
	}

	const table = isTomlTable(assignment.value) ? assignment.value : null;
	const action =
		typeof assignment.value === "string"
			? assignment.value
			: typeof table?.action === "string"
				? table.action
				: "";
	const actionParts = action.trim().split(/\s+/).filter(Boolean);
	const actionName = actionParts[0] ?? "";
	const args = actionParts.slice(1).join(" ");
	const parts = keys.split("+");
	const modifiers = parts.slice(0, -1);

	return {
		combo: rawKey,
		keys,
		modifiers,
		key: parts[parts.length - 1] ?? keys,
		submap,
		transition: typeof table?.submap === "string" ? table.submap : null,
		action,
		actionName,
		args,
		repeat: table?.repeat !== false,
		cooldownMs:
			typeof table?.cooldown_ms === "number" ? table.cooldown_ms : null,
		allowWhenLocked: table?.allow_when_locked === true,
		allowWhenInhibited: table?.allow_when_inhibited === true,
		source,
		line: assignment.line,
		text: assignment.text,
	};
}

export function collectKeybinds(files: ConfigFile[]): Keybind[] {
	const keybinds = new Map<string, Keybind>();

	for (const file of files) {
		for (const assignment of file.document.assignments) {
			if (assignment.path.length !== 2 || assignment.path[0] !== "keybinds")
				continue;
			const keybind = toKeybind(assignment, file.path);
			if (!keybind) continue;
			keybinds.set(`${keybind.submap ?? ""}\u0000${keybind.keys}`, keybind);
		}
	}

	return [...keybinds.values()];
}

export function collectScratchpads(files: ConfigFile[]): Scratchpad[] {
	const scratchpads = new Map<string, Scratchpad>();

	for (const file of files) {
		// An explicit empty rule list discards entries collected earlier.
		for (const assignment of file.document.assignments) {
			if (
				assignment.path.length === 1 &&
				assignment.path[0] === "scratchpad" &&
				Array.isArray(assignment.value) &&
				assignment.value.length === 0
			) {
				scratchpads.clear();
			}
		}

		const entries = file.document.data.scratchpad;
		if (!Array.isArray(entries)) continue;

		for (const entry of entries) {
			if (!isTomlTable(entry)) continue;
			const name = entry.name;
			if (typeof name !== "string" || !name) continue;

			scratchpads.set(name, { name });
		}
	}

	if (scratchpads.size === 0) return [{ name: "default" }];
	return [...scratchpads.values()];
}
