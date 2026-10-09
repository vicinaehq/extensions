import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { MatchList, parseMatches } from "./scores-data";

// 24 * 60 / 15 = 96 attempts/day, below the free tier's 100/day.
// Persist attempts before fetching so failures and command restarts count too.
export const INTERVAL_MS = 15 * 60 * 1000;
export const API_URL =
  "https://api.livetennisapi.com/api/public/v1/matches?status=live&limit=200";

export interface Snapshot extends MatchList {
  fetchedAt: number;
}

export interface Result {
  retryAt: number;
  snapshot?: Snapshot;
  error?: string;
  pending?: boolean;
}

export interface Store {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string): Promise<void>;
}

interface Options {
  store: Store;
  directory: string;
  request?: typeof fetch;
  now?: () => number;
}

async function readState(
  store: Store,
  key: string,
): Promise<Result | undefined> {
  const raw = await store.get(key);
  if (raw == null) return undefined;
  const state = JSON.parse(raw) as Result;
  if (
    !state ||
    !Number.isFinite(state.retryAt) ||
    (state.error !== undefined && typeof state.error !== "string")
  ) {
    throw new Error("Invalid saved request history");
  }
  if (state.snapshot) {
    if (!Number.isFinite(state.snapshot.fetchedAt))
      throw new Error("Invalid saved snapshot");
    parseMatches({
      data: state.snapshot.matches,
      meta: { has_more: state.snapshot.hasMore },
    });
  }
  return state;
}

function httpError(status: number): string {
  if (status === 401)
    return "The API key was not accepted. Check it in extension preferences.";
  if (status === 403)
    return "This key cannot read live matches. Check its access in your Live Tennis API account.";
  if (status === 429)
    return "The API request limit was reached. Wait until the next allowed refresh.";
  return `The score service returned HTTP ${status}. Try again after the next allowed refresh.`;
}

function retryAfter(value: string | null, now: number): number {
  if (!value) return 0;
  const seconds = Number(value);
  const at =
    Number.isFinite(seconds) && seconds >= 0
      ? now + seconds * 1000
      : Date.parse(value);
  return Number.isFinite(at) ? at : 0;
}

export async function loadSnapshot(
  apiKey: string,
  { store, directory, request = fetch, now = Date.now }: Options,
): Promise<Result> {
  const secret = apiKey.trim();
  if (!secret)
    throw new Error("Set your free API key in extension preferences.");
  const key = `scores-v1-${createHash("sha256").update(secret).digest("hex")}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });

  // LocalStorage alone has no compare-and-set. A process lock serializes the
  // read/reserve/fetch sequence across overlapping command instances.
  let release: () => Promise<void>;
  try {
    release = await lock(path.join(directory, key), {
      realpath: false,
      retries: 0,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ELOCKED") throw error;
    return {
      ...((await readState(store, key)) ?? { retryAt: now() + INTERVAL_MS }),
      pending: true,
    };
  }

  try {
    const previous = await readState(store, key);
    const started = now();
    if (previous && previous.retryAt > started) return previous;
    const result: Result = { retryAt: started + INTERVAL_MS };
    if (previous?.snapshot) result.snapshot = previous.snapshot;
    // If saving fails, fail closed without spending a request.
    await store.set(key, JSON.stringify(result));

    try {
      const response = await request(API_URL, {
        headers: { "X-API-Key": secret, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok) {
        result.error = httpError(response.status);
        if (response.status === 429)
          result.retryAt = Math.max(
            result.retryAt,
            retryAfter(response.headers.get("Retry-After"), now()),
          );
      } else {
        result.snapshot = {
          ...parseMatches(await response.json()),
          fetchedAt: now(),
        };
      }
    } catch {
      // Do not expose response bodies or transport errors that might echo a key.
      result.error =
        "Could not update scores. Check your connection and try again after the next allowed refresh.";
    }
    await store.set(key, JSON.stringify(result));
    return result;
  } finally {
    await release();
  }
}
