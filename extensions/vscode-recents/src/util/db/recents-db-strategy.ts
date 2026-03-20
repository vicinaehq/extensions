import type { DatabaseRow } from "../../types";

/** Matches `databaseBackend` preference values */
export type RecentsDbBackendId = "sqlite3" | "sqljs";

/**
 * Strategy for reading VS Code `state.vscdb` and persisting updated recents JSON.
 */
export interface RecentsDatabaseStrategy {
    readonly backendId: RecentsDbBackendId;

    queryRecentProjects(dbPath: string): Promise<DatabaseRow[]>;

    /** Writes the serialized JSON for `history.recentlyOpenedPathsList` back to the DB file */
    persistRecentsValue(dbPath: string, value: string): Promise<void>;
}
