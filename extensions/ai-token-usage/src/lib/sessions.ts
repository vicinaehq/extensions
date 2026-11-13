// Read-only session metadata (project directory and title) per tool, modelled on
// Token Monitor's readers. Usage numbers never come from here, only from tokscale.
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SessionMeta = { projectKey?: string; projectLabel?: string; title?: string };

const TITLE_MAX = 96;

export function cleanTitle(value: unknown): string | undefined {
	const text = String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
	if (!text) return undefined;
	const chars = Array.from(text);
	return chars.length <= TITLE_MAX ? text : `${chars.slice(0, TITLE_MAX - 1).join("")}…`;
}

// One key per directory across tools: Claude Code names its log folder after the cwd with
// every non-alphanumeric character turned into "-", so do the same to Codex/OpenCode paths.
export function projectKey(pathOrClaudeKey: string): string {
	return pathOrClaudeKey.replace(/[^A-Za-z0-9]/g, "-");
}

export function basename(path: string): string {
	return path.replace(/\/+$/, "").split("/").pop() || path;
}

// Latest title in a chunk of Claude JSONL: a /rename title beats the generated one.
export function claudeTitleFromText(text: string): string | undefined {
	let custom: string | undefined;
	let ai: string | undefined;
	for (const line of text.split("\n")) {
		if (!line.includes('"custom-title"') && !line.includes('"ai-title"')) continue;
		try {
			const e = JSON.parse(line);
			if (e?.type === "custom-title") custom = cleanTitle(e.customTitle) ?? custom;
			else if (e?.type === "ai-title") ai = cleanTitle(e.aiTitle) ?? ai;
		} catch {
			// a torn first line of the tail chunk
		}
	}
	return custom ?? ai;
}

const TAIL_BYTES = 512 * 1024;

// Claude Code re-writes the title record throughout a session, so the latest one sits near
// the end. shortcut: reads only the tail, then the whole file if the tail has none; a
// /rename title older than the tail loses to a newer generated one.
export function claudeTitle(path: string): string | undefined {
	let fd: number | undefined;
	try {
		const size = statSync(path).size;
		fd = openSync(path, "r");
		const start = Math.max(0, size - TAIL_BYTES);
		const buf = Buffer.alloc(size - start);
		readSync(fd, buf, 0, buf.length, start);
		return claudeTitleFromText(buf.toString("utf8")) ?? (start > 0 ? claudeTitleFromText(readFileSync(path, "utf8")) : undefined);
	} catch {
		return undefined;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

export function claudeMeta(ids: Set<string>, root = join(homedir(), ".claude", "projects")): Map<string, SessionMeta> {
	const out = new Map<string, SessionMeta>();
	let dirs: string[] = [];
	try {
		dirs = readdirSync(root);
	} catch {
		return out;
	}
	for (const dir of dirs) {
		let files: string[];
		try {
			files = readdirSync(join(root, dir));
		} catch {
			continue;
		}
		for (const f of files) {
			const id = f.endsWith(".jsonl") ? f.slice(0, -6) : "";
			if (!ids.has(id)) continue;
			out.set(id, { projectKey: projectKey(dir), title: claudeTitle(join(root, dir, f)) });
		}
	}
	return out;
}

type Row = Record<string, unknown>;

function querySqlite(dbPath: string, sql: (columns: Set<string>) => string | null, table: string): Row[] {
	if (!existsSync(dbPath)) return [];
	// node:sqlite is loaded lazily: it exists in the Node runtime Vicinae uses, not in every test runner
	const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
	const db = new DatabaseSync(dbPath, { readOnly: true });
	try {
		const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String((c as Row).name)));
		const q = sql(columns);
		return q ? (db.prepare(q).all() as Row[]) : [];
	} finally {
		db.close();
	}
}

const col = (columns: Set<string>, name: string) => (columns.has(name) ? `COALESCE(${name}, '')` : "''");

export function codexDbPath(home = process.env.CODEX_HOME || join(homedir(), ".codex")): string | undefined {
	const candidates: { path: string; version: number }[] = [];
	for (const dir of [home, join(home, "sqlite")]) {
		try {
			for (const name of readdirSync(dir)) {
				const m = name.match(/^state_(\d+)\.sqlite$/);
				if (m) candidates.push({ path: join(dir, name), version: Number(m[1]) });
			}
		} catch {
			// no such dir
		}
	}
	return candidates.sort((a, b) => b.version - a.version)[0]?.path;
}

// tokscale's Codex session id is the rollout file name, ending in the thread uuid.
export function codexThreadId(sessionId: string): string {
	return sessionId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?.[0] ?? sessionId;
}

export function codexMeta(ids: Set<string>, dbPath = codexDbPath()): Map<string, SessionMeta> {
	const out = new Map<string, SessionMeta>();
	if (!dbPath || ids.size === 0) return out;
	const byThread = new Map([...ids].map((id) => [codexThreadId(id), id]));
	for (const row of querySqlite(
		dbPath,
		(c) => (c.has("id") ? `SELECT id, ${col(c, "cwd")} AS cwd, ${col(c, "name")} AS name, ${col(c, "title")} AS title FROM threads` : null),
		"threads",
	)) {
		const id = byThread.get(String(row.id));
		if (!id) continue;
		const cwd = String(row.cwd || "");
		out.set(id, {
			projectKey: cwd ? projectKey(cwd) : undefined,
			projectLabel: cwd ? basename(cwd) : undefined,
			title: cleanTitle(row.name) ?? cleanTitle(row.title),
		});
	}
	return out;
}

export function opencodeDbPath(): string {
	return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "opencode.db");
}

function opencodeEntry(directory: unknown, title: unknown): SessionMeta {
	const dir = String(directory || "");
	return {
		projectKey: dir ? projectKey(dir) : undefined,
		projectLabel: dir ? basename(dir) : undefined,
		title: cleanTitle(title),
	};
}

// Newer OpenCode keeps sessions in `session_v2`, older in `session`, oldest in
// storage/session/<project>/<id>.json. Read all three, newest first.
export function opencodeMeta(ids: Set<string>, dbPath = opencodeDbPath()): Map<string, SessionMeta> {
	const out = new Map<string, SessionMeta>();
	if (ids.size === 0) return out;
	for (const table of ["session_v2", "session"]) {
		const rows = safe(() => {
			const m = new Map<string, Row>();
			for (const row of querySqlite(
				dbPath,
				(c) => (c.has("id") ? `SELECT id, ${col(c, "directory")} AS directory, ${col(c, "title")} AS title FROM ${table}` : null),
				table,
			))
				m.set(String(row.id), row);
			return m;
		});
		for (const [id, row] of rows) if (ids.has(id) && !out.has(id)) out.set(id, opencodeEntry(row.directory, row.title));
	}
	const storage = join(dbPath, "..", "storage", "session");
	const missing = [...ids].filter((id) => !out.has(id));
	if (missing.length > 0) {
		let projects: string[] = [];
		try {
			projects = readdirSync(storage);
		} catch {
			// no legacy storage
		}
		for (const project of projects) {
			for (const id of missing) {
				if (out.has(id)) continue;
				try {
					const json = JSON.parse(readFileSync(join(storage, project, `${id}.json`), "utf8"));
					out.set(id, opencodeEntry(json?.directory, json?.title));
				} catch {
					// not in this project
				}
			}
		}
	}
	return out;
}

// A locked or missing database means no titles, never an error.
export function safe<T>(fn: () => Map<string, T>): Map<string, T> {
	try {
		return fn();
	} catch {
		return new Map();
	}
}
