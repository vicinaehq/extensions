import type { DatabaseRow } from "../../types";

interface CacheEntry {
    rows: DatabaseRow[];
    dbPath: string;
    mtime: number;
    backend: string;
}

let cache: CacheEntry | null = null;

export function getCachedQueryResult(dbPath: string, mtime: number, backend: string): DatabaseRow[] | null {
    if (cache && cache.dbPath === dbPath && cache.mtime === mtime && cache.backend === backend) {
        return cache.rows;
    }
    return null;
}

export function setCachedQueryResult(dbPath: string, mtime: number, backend: string, rows: DatabaseRow[]): void {
    cache = { rows, dbPath, mtime, backend };
}

export function clearQueryCache(): void {
    cache = null;
}
