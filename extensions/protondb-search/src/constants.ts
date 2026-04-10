import ms from "ms";

export const REQUEST_TIMEOUT_MS = ms("10s");
export const PERSIST_MAX_AGE = ms("12h");
export const QUERY_STALE_TIME = PERSIST_MAX_AGE;
export const IMAGE_CACHE_CAPACITY = 5 * 1024 * 1024; // 5 MB
export const PERSIST_KEY = "protondb-query-v1";
