import type { Preferences } from "../../types";
import type { RecentsDatabaseStrategy } from "./recents-db-strategy";
import { sqlite3Strategy } from "./sqlite3-strategy";
import { sqlJsStrategy } from "./sqljs-strategy";

export { clearQueryCache } from "./query-cache";
export type { RecentsDatabaseStrategy, RecentsDbBackendId } from "./recents-db-strategy";
export { isSqlite3BinaryNotFound, SQLITE3_NOT_FOUND_MESSAGE } from "./sqlite3-binary-errors";
export { sqlite3Strategy } from "./sqlite3-strategy";
export { sqlJsStrategy } from "./sqljs-strategy";

export function getRecentsDatabaseStrategy(databaseBackend: Preferences["databaseBackend"]): RecentsDatabaseStrategy {
    return databaseBackend === "sqljs" ? sqlJsStrategy : sqlite3Strategy;
}
