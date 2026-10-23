import { open, readdir } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";

const PREVIEW_BYTES = 16 * 1024;
const PREVIEW_LINES = 80;
const DIR_ENTRIES = 60;

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".bmp",
	".svg",
	".ico",
]);

const LANGUAGES: Record<string, string> = {
	".ts": "typescript",
	".tsx": "tsx",
	".js": "javascript",
	".mjs": "javascript",
	".cjs": "javascript",
	".jsx": "jsx",
	".py": "python",
	".rs": "rust",
	".go": "go",
	".rb": "ruby",
	".sh": "bash",
	".zsh": "bash",
	".fish": "fish",
	".md": "markdown",
	".yml": "yaml",
	".yaml": "yaml",
	".toml": "toml",
	".json": "json",
	".c": "c",
	".h": "c",
	".cpp": "cpp",
	".hpp": "cpp",
	".java": "java",
	".kt": "kotlin",
	".lua": "lua",
	".php": "php",
	".css": "css",
	".scss": "scss",
	".html": "html",
	".xml": "xml",
	".sql": "sql",
	".gd": "gdscript",
};

export const languageFor = (path: string) =>
	LANGUAGES[extname(path).toLowerCase()] ?? "";

export const isImage = (path: string) =>
	IMAGE_EXTENSIONS.has(extname(path).toLowerCase());

/** Wraps text in a fence longer than any backtick run inside it. */
export function codeBlock(text: string, language = "") {
	const longest = Math.max(
		2,
		...Array.from(text.matchAll(/`+/g), (m) => m[0].length),
	);
	const fence = "`".repeat(longest + 1);
	return `${fence}${language}\n${text}\n${fence}`;
}

async function readHead(path: string): Promise<Buffer> {
	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(PREVIEW_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, PREVIEW_BYTES, 0);
		return buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

export async function previewMarkdown(
	path: string,
	kind: "file" | "directory",
): Promise<string> {
	try {
		if (kind === "directory") {
			const entries = await readdir(path, { withFileTypes: true });
			const visible = entries
				.filter((e) => !e.name.startsWith("."))
				.sort((a, b) =>
					a.isDirectory() === b.isDirectory()
						? a.name.localeCompare(b.name)
						: a.isDirectory()
							? -1
							: 1,
				);
			if (!visible.length) return "_Empty folder_";
			const lines = visible
				.slice(0, DIR_ENTRIES)
				.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
			if (visible.length > DIR_ENTRIES)
				lines.push(`… ${visible.length - DIR_ENTRIES} more`);
			return codeBlock(lines.join("\n"));
		}

		if (isImage(path)) {
			return `![](${pathToFileURL(path).href})`;
		}

		const head = await readHead(path);
		if (head.length === 0) return "_Empty file_";
		if (head.includes(0)) return "_Binary file, no preview_";

		const lines = head.toString("utf8").split("\n").slice(0, PREVIEW_LINES);
		return codeBlock(lines.join("\n").trimEnd(), languageFor(path));
	} catch (e) {
		return `_Preview unavailable: ${e instanceof Error ? e.message : String(e)}_`;
	}
}

/** Renders grep context with line numbers and a marker on the matching line. */
export function matchContextMarkdown(
	path: string,
	line: number,
	text: string,
	before: string[],
	after: string[],
): string {
	const first = line - before.length;
	const all = [...before, text, ...after];
	const width = String(first + all.length - 1).length;
	const body = all
		.map((content, i) => {
			const n = first + i;
			const marker = n === line ? "▶" : " ";
			return `${marker} ${String(n).padStart(width)}  ${content}`;
		})
		.join("\n");
	return codeBlock(body, languageFor(path));
}

export function formatBytes(bytes: number) {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
