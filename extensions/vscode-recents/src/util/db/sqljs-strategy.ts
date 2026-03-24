import { readFile, statSync, writeFile } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import initSqlJs from "sql.js";
import { RECENT_PROJECTS_KEY, RECENT_PROJECTS_QUERY, SQL_WASM_PATH } from "../../constants";
import type { DatabaseRow } from "../../types";
import { getCachedQueryResult, setCachedQueryResult } from "./query-cache";
import type { RecentsDatabaseStrategy } from "./recents-db-strategy";

const read = promisify(readFile);
const write = promisify(writeFile);

function getSqlWasmPath(): string {
    return path.resolve(__dirname, SQL_WASM_PATH);
}

export const sqlJsStrategy: RecentsDatabaseStrategy = {
    backendId: "sqljs",

    async queryRecentProjects(dbPath: string): Promise<DatabaseRow[]> {
        const mtime = statSync(dbPath).mtimeMs;
        const backend = this.backendId;

        const cached = getCachedQueryResult(dbPath, mtime, backend);
        if (cached !== null) {
            return cached;
        }

        const bufferRaw = await read(dbPath);
        const SQL = await initSqlJs({
            locateFile: () => getSqlWasmPath(),
        });
        const db = new SQL.Database(new Uint8Array(bufferRaw as Buffer));

        const results: DatabaseRow[] = [];
        try {
            const statement = db.prepare(RECENT_PROJECTS_QUERY);
            while (statement.step()) {
                const row = statement.getAsObject();
                if (row.value) {
                    results.push({
                        key: row.key as string,
                        value: row.value as string,
                    });
                }
            }
            statement.free();
        } finally {
            db.close();
        }

        setCachedQueryResult(dbPath, mtime, backend, results);
        return results;
    },

    async persistRecentsValue(dbPath: string, value: string): Promise<void> {
        const bufferRaw = await read(dbPath);
        const SQL = await initSqlJs({
            locateFile: () => getSqlWasmPath(),
        });
        const db = new SQL.Database(new Uint8Array(bufferRaw as Buffer));

        try {
            db.run("UPDATE ItemTable SET value = ? WHERE key = ?", [value, RECENT_PROJECTS_KEY]);
            const data = db.export();
            await write(dbPath, Buffer.from(data));
        } finally {
            db.close();
        }
    },
};
