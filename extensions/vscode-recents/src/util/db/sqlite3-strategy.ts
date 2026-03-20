import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { RECENT_PROJECTS_KEY, RECENT_PROJECTS_QUERY, SQLITE3_BINARY } from "../../constants";
import type { DatabaseRow } from "../../types";
import { getCachedQueryResult, setCachedQueryResult } from "./query-cache";
import type { RecentsDatabaseStrategy } from "./recents-db-strategy";

const execFileAsync = promisify(execFile);

async function runSqlite3(dbPath: string, sql: string): Promise<string> {
    const { stdout } = await execFileAsync(SQLITE3_BINARY, ["-batch", "-noheader", dbPath, sql]);
    return stdout;
}

export const sqlite3Strategy: RecentsDatabaseStrategy = {
    backendId: "sqlite3",

    async queryRecentProjects(dbPath: string): Promise<DatabaseRow[]> {
        const mtime = statSync(dbPath).mtimeMs;
        const backend = this.backendId;

        const cached = getCachedQueryResult(dbPath, mtime, backend);
        if (cached !== null) {
            return cached;
        }

        const stdout = await runSqlite3(dbPath, RECENT_PROJECTS_QUERY);
        const trimmed = stdout.trim();
        if (!trimmed) {
            setCachedQueryResult(dbPath, mtime, backend, []);
            return [];
        }
        const pipeIdx = trimmed.indexOf("|");
        const value = pipeIdx >= 0 ? trimmed.slice(pipeIdx + 1) : trimmed;
        const rows: DatabaseRow[] = value ? [{ key: RECENT_PROJECTS_KEY, value }] : [];
        setCachedQueryResult(dbPath, mtime, backend, rows);
        return rows;
    },

    async persistRecentsValue(dbPath: string, value: string): Promise<void> {
        const escapedValue = value.replace(/'/g, "''");
        const sql = `UPDATE ItemTable SET value = '${escapedValue}' WHERE key = '${RECENT_PROJECTS_KEY}'`;

        const tmpDir = mkdtempSync(path.join(tmpdir(), "vscode-recents-"));
        const sqlPath = path.join(tmpDir, "update.sql");
        try {
            writeFileSync(sqlPath, sql, "utf8");
            await execFileAsync(SQLITE3_BINARY, [dbPath, `.read ${sqlPath}`]);
        } finally {
            try {
                rmSync(tmpDir, { recursive: true });
            } catch {
                // ignore cleanup errors
            }
        }
    },
};
