import { getPreferenceValues } from "@vicinae/api";
import { RECENT_PROJECTS_KEY } from "../constants";
import { getVSCodeStateDBPath } from "../helpers";
import type { DatabaseRow, Preferences } from "../types";
import { clearQueryCache, getRecentsDatabaseStrategy, isSqlite3BinaryNotFound, SQLITE3_NOT_FOUND_MESSAGE } from "./db";

export async function queryRecentProjects(): Promise<DatabaseRow[]> {
    const dbPath = getVSCodeStateDBPath();
    const { databaseBackend } = getPreferenceValues<Preferences>();
    const strategy = getRecentsDatabaseStrategy(databaseBackend);

    try {
        return await strategy.queryRecentProjects(dbPath);
    } catch (error) {
        if (strategy.backendId === "sqlite3" && isSqlite3BinaryNotFound(error)) {
            throw new Error(SQLITE3_NOT_FOUND_MESSAGE);
        }
        if (strategy.backendId === "sqlite3") {
            throw new Error(
                `Failed to query recents. Ensure sqlite3 is installed (e.g. sudo apt install sqlite3). ${(error as Error).message}`,
            );
        }
        throw error;
    }
}

export async function removeRecentProject(projectPath: string): Promise<void> {
    const dbPath = getVSCodeStateDBPath();
    const { databaseBackend } = getPreferenceValues<Preferences>();
    const strategy = getRecentsDatabaseStrategy(databaseBackend);

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

    try {
        await strategy.persistRecentsValue(dbPath, updatedValue);
    } catch (error) {
        if (strategy.backendId === "sqlite3" && isSqlite3BinaryNotFound(error)) {
            throw new Error(SQLITE3_NOT_FOUND_MESSAGE);
        }
        throw error;
    }

    clearQueryCache();
    console.log("[DEBUG] Removed project from recents:", projectPath);
}
