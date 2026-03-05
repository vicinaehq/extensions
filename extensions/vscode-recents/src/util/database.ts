import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { RECENT_PROJECTS_KEY, SQLITE3_BINARY } from "../constants";
import { getVSCodeStateDBPath } from "../helpers";
import type { DatabaseRow } from "../types";

const execFileAsync = promisify(execFile);

interface CacheEntry {
    rows: DatabaseRow[];
    dbPath: string;
    mtime: number;
}

let cache: CacheEntry | null = null;

async function runSqlite3(dbPath: string, sql: string): Promise<string> {
    const { stdout } = await execFileAsync(SQLITE3_BINARY, ["-batch", "-noheader", dbPath, sql]);
    return stdout;
}

export async function queryRecentProjects(): Promise<DatabaseRow[]> {
    const dbPath = getVSCodeStateDBPath();
    const mtime = statSync(dbPath).mtimeMs;

    if (cache && cache.dbPath === dbPath && cache.mtime === mtime) {
        return cache.rows;
    }

    try {
        const sql = `SELECT key, value FROM ItemTable WHERE key = '${RECENT_PROJECTS_KEY}'`;
        const stdout = await runSqlite3(dbPath, sql);
        const trimmed = stdout.trim();
        if (!trimmed) {
            cache = { rows: [], dbPath, mtime };
            return [];
        }
        const pipeIdx = trimmed.indexOf("|");
        const value = pipeIdx >= 0 ? trimmed.slice(pipeIdx + 1) : trimmed;
        const rows: DatabaseRow[] = value ? [{ key: RECENT_PROJECTS_KEY, value }] : [];
        cache = { rows, dbPath, mtime };
        return rows;
    } catch (error) {
        throw new Error(
            `Failed to query recents. Ensure sqlite3 is installed (e.g. sudo apt install sqlite3). ${(error as Error).message}`,
        );
    }
}

export async function removeRecentProject(projectPath: string): Promise<void> {
    const dbPath = getVSCodeStateDBPath();
    const rows = await queryRecentProjects();

    const row = rows.find((r) => r.key === RECENT_PROJECTS_KEY);
    if (!row?.value) {
        throw new Error("No recent projects data found");
    }

    const recentData = JSON.parse(row.value) as {
        entries?: { folderUri?: string; workspace?: { configPath: string }; fileUri?: string }[];
    };
    if (!recentData?.entries) {
        throw new Error("No recent projects data found");
    }

    const originalLength = recentData.entries.length;
    recentData.entries = recentData.entries.filter((entry) => {
        const entryPath = entry.folderUri || entry.workspace?.configPath || entry.fileUri || "";
        const decodedPath = decodeURIComponent(entryPath.replace(/^file:\/\//, ""));
        return decodedPath !== projectPath;
    });

    if (recentData.entries.length === originalLength) {
        console.warn("Project not found in recent list:", projectPath);
        return;
    }

    const updatedValue = JSON.stringify(recentData);
    const escapedValue = updatedValue.replace(/'/g, "''");
    const sql = `UPDATE ItemTable SET value = '${escapedValue}' WHERE key = '${RECENT_PROJECTS_KEY}'`;

    const tmpDir = mkdtempSync(path.join(tmpdir(), "vscode-recents-"));
    const sqlPath = path.join(tmpDir, "update.sql");
    try {
        writeFileSync(sqlPath, sql, "utf8");
        await execFileAsync(SQLITE3_BINARY, [dbPath, `.read ${sqlPath}`]);
        cache = null;
    } finally {
        try {
            rmSync(tmpDir, { recursive: true });
        } catch {
            // ignore cleanup errors
        }
    }
}
