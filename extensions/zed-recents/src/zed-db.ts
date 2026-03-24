import { homedir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { access, readdir, stat } from "node:fs/promises";
import { ZED_CHANNEL_DIRS, ZED_DB_DIRS } from "./constants";
import type { RecentProject, RemoteConnection } from "./types";

function getDbDir(): string {
    const home = homedir();
    const platform = process.platform as keyof typeof ZED_DB_DIRS;
    const resolve = platform in ZED_DB_DIRS ? ZED_DB_DIRS[platform] : ZED_DB_DIRS.linux;
    return resolve(home);
}

/** Returns all existing channel db.sqlite paths, ordered by preference. */
async function discoverDbPaths(): Promise<string[]> {
    const dbDir = getDbDir();
    const paths: string[] = [];

    // Check known channel dirs first (in priority order)
    for (const channel of ZED_CHANNEL_DIRS) {
        const dbPath = join(dbDir, channel, "db.sqlite");
        if (await fileExists(dbPath)) {
            paths.push(dbPath);
        }
    }

    // Also scan for any other 0-* dirs we might not know about
    try {
        const entries = await readdir(dbDir);
        for (const entry of entries) {
            if (!entry.startsWith("0-")) continue;
            if (CHANNEL_DIRS_SET.has(entry)) continue; // already checked
            const dbPath = join(dbDir, entry, "db.sqlite");
            if (await fileExists(dbPath)) {
                paths.push(dbPath);
            }
        }
    } catch {
        // dbDir doesn't exist or not readable
    }

    return paths;
}

const CHANNEL_DIRS_SET = new Set<string>(ZED_CHANNEL_DIRS);

/** Returns the first found db path (for display/diagnostics). */
export function getDbPath(): string {
    const dbDir = getDbDir();
    return join(dbDir, "0-stable", "db.sqlite");
}

export async function loadRecents(): Promise<{ items: RecentProject[]; diagnostics?: string }> {
    const dbPaths = await discoverDbPaths();

    if (dbPaths.length === 0) {
        const fallback = getDbPath();
        return {
            items: [],
            diagnostics: `Zed database not found at:\n  ${fallback}\n\nMake sure Zed is installed and has been opened at least once.`,
        };
    }

    const query = `SELECT w.workspace_id, w.paths, w.timestamp, w.remote_connection_id,
        rc.kind, rc.host, rc.port, rc.user, rc.name
        FROM workspaces w
        LEFT JOIN remote_connections rc ON w.remote_connection_id = rc.id
        WHERE w.paths IS NOT NULL AND length(w.paths) > 0
        ORDER BY w.timestamp DESC;`;

    // Query all discovered databases and merge results
    const seen = new Map<string, RecentProject>();
    let sqliteCliMissing = false;

    for (const dbPath of dbPaths) {
        const result = await execSqlite(dbPath, query);
        if (result.code !== 0) {
            if (isSqliteCliMissing(result.code, result.stderr, result.stdout)) {
                sqliteCliMissing = true;
            }
            continue;
        }

        for (const line of result.stdout.split("\n")) {
            if (!line.trim()) continue;
            const cols = line.split("|");
            const path = cols[1];
            if (!path) continue;

            // Deduplicate: keep the entry with the newest timestamp
            const timestamp = cols[2];
            const lastOpened = timestamp ? new Date(timestamp.endsWith("Z") ? timestamp : `${timestamp}Z`) : undefined;
            const existing = seen.get(path);
            if (existing?.lastOpened && lastOpened && existing.lastOpened >= lastOpened) {
                continue;
            }

            const remote = cols[4] ? parseRemote(cols) : undefined;
            const exists = remote ? true : await fileExists(path);
            const isDirectory = exists && !remote ? await isDir(path) : true;

            seen.set(path, {
                path,
                label: basename(path),
                exists,
                isDirectory,
                lastOpened,
                keywords: makeKeywords(basename(path), path),
                remote,
            });
        }
    }

    const items = Array.from(seen.values()).sort((a, b) => {
        if (!a.lastOpened || !b.lastOpened) return 0;
        return b.lastOpened.getTime() - a.lastOpened.getTime();
    });

    if (items.length === 0) {
        if (sqliteCliMissing) {
            return {
                items: [],
                diagnostics: "The `sqlite3` CLI is not installed or not available in PATH.\n\nInstall sqlite3 and restart Vicinae.",
            };
        }
        return { items: [], diagnostics: "No recent projects found in Zed database." };
    }

    return { items };
}

export async function removeRecent(projectPath: string): Promise<void> {
    const dbPaths = await discoverDbPaths();
    const escaped = projectPath.replace(/'/g, "''");
    // Remove from all databases where it might exist
    await Promise.all(dbPaths.map((dbPath) => execSqlite(dbPath, `DELETE FROM workspaces WHERE paths='${escaped}';`)));
}

function parseRemote(cols: string[]): RemoteConnection {
    return {
        kind: cols[4],
        host: cols[5] || undefined,
        port: cols[6] ? Number.parseInt(cols[6], 10) : undefined,
        user: cols[7] || undefined,
        name: cols[8] || undefined,
    };
}

function makeKeywords(label: string, fullPath: string): string[] {
    const parts = fullPath.split("/").filter(Boolean);
    const lastParts = parts.slice(-6);
    const uniq = new Set<string>([label, ...lastParts]);
    return Array.from(uniq);
}

async function isDir(p: string): Promise<boolean> {
    try {
        return (await stat(p)).isDirectory();
    } catch {
        return false;
    }
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await access(p);
        return true;
    } catch {
        return false;
    }
}

function execSqlite(dbPath: string, sql: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
        const child = spawn("sqlite3", ["-noheader", "-separator", "|", "-batch", dbPath, sql], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (d) => (stdout += String(d)));
        child.stderr?.on("data", (d) => (stderr += String(d)));
        child.on("error", (err) => resolve({ stdout: "", stderr: String(err), code: 127 }));
        child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    });
}

function isSqliteCliMissing(code: number, stderr: string, stdout: string): boolean {
    // POSIX command-not-found exits with 127. This is the most reliable signal.
    if (code === 127) return true;

    const text = `${stderr}\n${stdout}`.toLowerCase();
    return text.includes("spawn sqlite3 enoent") || (text.includes("sqlite3") && text.includes("not found"));
}
