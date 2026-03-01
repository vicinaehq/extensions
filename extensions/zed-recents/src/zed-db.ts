import { homedir } from "node:os";
import { basename } from "node:path";
import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { ZED_DB_PATHS } from "./constants";
import type { RecentProject, RemoteConnection } from "./types";

export function getDbPath(): string {
    const home = homedir();
    const platform = process.platform as keyof typeof ZED_DB_PATHS;
    const resolve = platform in ZED_DB_PATHS ? ZED_DB_PATHS[platform] : ZED_DB_PATHS.linux;
    return resolve(home);
}

export async function loadRecents(): Promise<{ items: RecentProject[]; diagnostics?: string }> {
    const dbPath = getDbPath();

    if (!(await fileExists(dbPath))) {
        return { items: [], diagnostics: `Zed database not found at:\n  ${dbPath}\n\nMake sure Zed is installed and has been opened at least once.` };
    }

    const query = `SELECT w.workspace_id, w.paths, w.timestamp, w.remote_connection_id,
        rc.kind, rc.host, rc.port, rc.user, rc.name
        FROM workspaces w
        LEFT JOIN remote_connections rc ON w.remote_connection_id = rc.id
        WHERE w.paths IS NOT NULL AND length(w.paths) > 0
        ORDER BY w.timestamp DESC;`;

    const result = await execSqlite(dbPath, query);
    if (result.code !== 0) {
        return { items: [], diagnostics: `Failed to read Zed database:\n${result.stderr}` };
    }

    const items: RecentProject[] = [];
    for (const line of result.stdout.split("\n")) {
        if (!line.trim()) continue;
        const cols = line.split("|");
        const path = cols[1];
        if (!path) continue;

        const timestamp = cols[2];
        const remote = cols[4] ? parseRemote(cols) : undefined;
        const exists = remote ? true : await fileExists(path);
        const isDirectory = exists && !remote ? await isDir(path) : true;

        items.push({
            path,
            label: basename(path),
            exists,
            isDirectory,
            lastOpened: timestamp ? new Date(timestamp.endsWith("Z") ? timestamp : `${timestamp}Z`) : undefined,
            keywords: makeKeywords(basename(path), path),
            remote,
        });
    }

    if (items.length === 0) {
        return { items: [], diagnostics: "No recent projects found in Zed database." };
    }

    return { items };
}

export async function removeRecent(projectPath: string): Promise<void> {
    const dbPath = getDbPath();
    const escaped = projectPath.replace(/'/g, "''");
    await execSqlite(dbPath, `DELETE FROM workspaces WHERE paths='${escaped}';`);
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
