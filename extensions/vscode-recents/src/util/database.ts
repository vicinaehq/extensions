import path from "path";
import { readFile, writeFile } from "fs";
import { promisify } from "util";
import { DatabaseRow } from "../types";
import initSqlJs, { Database } from "sql.js";
import { getVSCodeStateDBPath } from "../helpers";
import { RECENT_PROJECTS_QUERY, SQL_WASM_PATH } from "../constants";

const read = promisify(readFile);
const write = promisify(writeFile);

let DATABASE: Database | null = null;

export async function initializeDatabase(): Promise<Database> {
    if (DATABASE) {
        return DATABASE;
    }

    const dbPath = getVSCodeStateDBPath();

    try {
        const bufferRaw = await read(dbPath);
        const SQL = await initSqlJs({
            locateFile: () => path.resolve(__dirname, SQL_WASM_PATH),
        });

        console.log("[DEBUG] Loaded VSCode state database from:", dbPath);
        DATABASE = new SQL.Database(new Uint8Array(bufferRaw));
        return DATABASE;
    } catch (error) {
        throw new Error(`Failed to initialize database: ${(error as Error).message}`);
    }
}

export function getDatabase(): Database {
    if (!DATABASE) {
        throw new Error("Database not initialized. Call initializeDatabase() first.");
    }
    return DATABASE;
}

export function queryRecentProjects(): DatabaseRow[] {
    const db = getDatabase();
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
        return results;
    } catch (error) {
        console.error("Failed to query the database", error);
        throw new Error("Failed to query the database");
    }
}

export function closeDatabase(): void {
    if (DATABASE) {
        DATABASE.close();
        DATABASE = null;
    }
}

export async function removeRecentProject(projectPath: string): Promise<void> {
    const db = getDatabase();
    const dbPath = getVSCodeStateDBPath();

    try {
        let key: string = "";
        let recentData: any = null;
        const statement = db.prepare(RECENT_PROJECTS_QUERY);

        while (statement.step()) {
            const row = statement.getAsObject();
            if (row.value) {
                key = row.key as string;
                recentData = JSON.parse(row.value as string);
                break;
            }
        }
        statement.free();

        if (!recentData || !recentData.entries) {
            throw new Error("No recent projects data found");
        }

        // Filter out the project to remove
        const originalLength = recentData.entries.length;
        recentData.entries = recentData.entries.filter((entry: any) => {
            const entryPath = entry.folderUri || entry.workspace?.configPath || entry.fileUri || "";
            const decodedPath = decodeURIComponent(entryPath.replace(/^file:\/\//, ""));
            return decodedPath !== projectPath;
        });

        // Check if anything was removed
        if (recentData.entries.length === originalLength) {
            console.warn("Project not found in recent list:", projectPath);
            return;
        }

        const updatedValue = JSON.stringify(recentData);
        db.run("UPDATE ItemTable SET value = ? WHERE key = ?", [updatedValue, key]);

        const data = db.export();
        await write(dbPath, data);

        console.log("[DEBUG] Removed project from recents:", projectPath);
    } catch (error) {
        console.error("Failed to remove project from recents:", error);
        throw new Error(`Failed to remove project: ${(error as Error).message}`);
    }
}
