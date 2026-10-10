import { promises as dnsPromises } from 'node:dns';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { cacheDir } from '../mpd/albumart-paths.js';
import { streamArtCachePath, findStreamArt } from '../mpd/stream-art-paths.js';
import { isValidImage, sniffImageType } from './image-validate.js';

// radio-browser.info enrichment for MPD webradio stream URIs.
//
// Looks up station name + favicon for stream URLs in the queue so rows
// don't render as bare hostnames. All work is best-effort: if the API
// is down, slow, or returns no match we fall back to today's behavior
// (Wifi icon, host as title). Results are cached on disk with TTLs so
// repeat opens of the queue don't hit the network.
//
// Architecture: pure module, no React, no MPD. The QueueList component
// calls `lookupStations` (batched) and `downloadStationFavicon`; both
// stream their results back via callbacks so the UI can render
// progressively.

// ---- Constants ----

// How long positive lookups remain valid. Station metadata changes
// slowly; a week-stale name is fine and saves us a lot of API calls.
export const POSITIVE_TTL_MS = 7 * 24 * 3600 * 1000;

// How long negative results (no match for a URL) remain valid. Shorter
// than positive so newly indexed stations show up within a day.
export const NEGATIVE_TTL_MS = 1 * 24 * 3600 * 1000;

// Per-lookup HTTP timeout. Matches the spirit of STREAM_ART_TIMEOUT_MS
// in albumart.ts: short cap so a slow API server can never freeze the UI.
export const LOOKUP_TIMEOUT_MS = 3000;

// Cap on in-flight lookups during a batch. Matches the album-art batch
// concurrency for symmetry; could go higher but the API is community-
// run and we want to be polite.
export const MAX_CONCURRENCY = 4;

// How long the SRV-resolved host list is reused before re-resolving.
// Long-running processes pick up host changes within an hour.
export const HOSTS_TTL_MS = 60 * 60 * 1000;

// Favicon download timeout. Slightly more generous than the lookup
// timeout because favicon CDNs can be flaky.
export const FAVICON_TIMEOUT_MS = 3000;

// User-Agent string sent on every request. radio-browser asks for
// descriptive UAs in their docs. We hardcode the app version because
// package.json has no `version` field (the manifest is for the Vicinae
// extension store, not semver).
export const USER_AGENT = 'vicinae-mpd/0.1.0';

// Used when DNS SRV resolution fails. The "de1" mirror is one of the
// long-standing API hosts; if it's also down we degrade gracefully.
export const DEFAULT_FALLBACK_HOST = 'https://de1.api.radio-browser.info';

// Name of the persistent cache file inside the album-art cache dir.
export const CACHE_FILE_NAME = 'radio-browser.json';

// ---- Types ----

export type StationInfo = {
  name: string;
  faviconUrl?: string;
  homepage?: string;
};

// ---- API response mapping ----

// Shape of one element in the radio-browser /json/stations/byurl response.
// We only consume the fields we need; everything else is ignored. Marked
// as a "loose" type with optional everything because the API may add or
// remove fields and we want to fail soft.
export type ApiStation = {
  name?: string;
  favicon?: string;
  homepage?: string;
  votes?: number;
};

// Pick the most authoritative entry from a list of API matches. When a
// stream URL has been registered multiple times in the directory, the
// canonical entry is the one with the most user votes.
export function pickBestEntry<T extends { votes?: number }>(
  entries: T[],
): T | null {
  if (entries.length === 0) return null;
  let best = entries[0]!;
  let bestVotes = typeof best.votes === 'number' ? best.votes : 0;
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i]!;
    const v = typeof e.votes === 'number' ? e.votes : 0;
    if (v > bestVotes) {
      best = e;
      bestVotes = v;
    }
  }
  return best;
}

// Map the raw JSON body from /json/stations/byurl or /json/stations/search
// into our internal StationInfo. Returns null when the body isn't a
// non-empty array of stations or when the best match has no usable name.
export function mapApiResponse(body: unknown): StationInfo | null {
  if (!Array.isArray(body)) return null;
  const best = pickBestEntry(body as ApiStation[]);
  if (!best) return null;
  const name = typeof best.name === 'string' ? best.name.trim() : '';
  // If the canonical (highest-votes) entry lacks a usable name we don't
  // fall through to lower-voted entries — a malformed top entry is
  // treated as "no usable match".
  if (name.length === 0) return null;
  const info: StationInfo = { name };
  if (typeof best.favicon === 'string' && best.favicon.length > 0) {
    info.faviconUrl = best.favicon;
  }
  if (typeof best.homepage === 'string' && best.homepage.length > 0) {
    info.homepage = best.homepage;
  }
  return info;
}

// ---- Host discovery (DNS SRV with test seams) ----

// Minimal shape we consume from dns.resolveSrv. Matches Node's SrvRecord
// but lets tests pass plain objects without importing the type.
export type SrvRecordLike = {
  name: string;
  port: number;
  priority: number;
  weight: number;
};

type SrvResolver = (hostname: string) => Promise<SrvRecordLike[]>;
type Clock = () => number;

// Narrow alias for the global fetch type. We accept anything that
// matches this signature so tests can pass arbitrary stubs.
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

// Module-level factory consts so we only spell out the defaults once.
// _resetForTests and _setFetchForTests both restore from these.
const defaultSrvResolver: SrvResolver = (h) =>
  dnsPromises.resolveSrv(h) as Promise<SrvRecordLike[]>;
const defaultClock: Clock = () => Date.now();
const defaultFetch: FetchLike = ((input, init) =>
  fetch(input as string, init)) as FetchLike;

let srvResolver: SrvResolver = defaultSrvResolver;
let clock: Clock = defaultClock;
let fetchImpl: FetchLike = defaultFetch;

let cachedHosts: string[] | null = null;
let hostsResolvedAt = 0;
let fallbackWarned = false;

export function _setSrvResolverForTests(fn: SrvResolver): void {
  srvResolver = fn;
}

export function _setClockForTests(fn: Clock): void {
  clock = fn;
}

export function _setHostsForTests(hosts: string[]): void {
  cachedHosts = hosts.slice();
  hostsResolvedAt = clock();
}

export function _setFetchForTests(fn: FetchLike | null): void {
  fetchImpl = fn ?? defaultFetch;
}

// Resolve the API host list. Env override skips DNS entirely; otherwise
// we cache SRV results for HOSTS_TTL_MS. Failure is non-fatal — we fall
// back to a known-good host and log once.
export async function getApiHosts(): Promise<string[]> {
  const override = process.env.RADIO_BROWSER_API;
  if (override) return [override];

  const now = clock();
  if (cachedHosts && now - hostsResolvedAt < HOSTS_TTL_MS) {
    return cachedHosts;
  }

  try {
    const records = await srvResolver('_api._tcp.radio-browser.info');
    if (records.length === 0) throw new Error('no SRV records');
    // Shuffle to spread load across users / process starts.
    // SRV records carry a port, but all radio-browser.info mirrors serve
    // https on 443. We ignore the port and hardcode https://.
    const shuffled = records
      .map((r) => ({ r, s: Math.random() }))
      .sort((a, b) => a.s - b.s)
      .map((x) => `https://${x.r.name.replace(/\.$/, '')}`);
    cachedHosts = shuffled;
    hostsResolvedAt = now;
    return shuffled;
  } catch (e) {
    if (!fallbackWarned) {
      console.warn(
        'radio-browser: SRV resolution failed, using fallback host:',
        e instanceof Error ? e.message : String(e),
      );
      fallbackWarned = true;
    }
    cachedHosts = [DEFAULT_FALLBACK_HOST];
    hostsResolvedAt = now;
    return cachedHosts;
  }
}

// Reset all module-scope state. Test-only.
export function _resetForTests(): void {
  cachedHosts = null;
  hostsResolvedAt = 0;
  fallbackWarned = false;
  srvResolver = defaultSrvResolver;
  clock = defaultClock;
  fetchImpl = defaultFetch;
  cacheMap = null;
  cachePath = null;
  loadedFromDisk = false;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pendingFlush = null;
}

// ---- HTTP layer ----

// One HTTP attempt against one host. Returns:
//   { kind: 'ok',   info: StationInfo | null }  — request completed,
//        info is null when there was no match (negative result).
//   { kind: 'retry' }                            — host failed; try next
//
// "ok" with null info covers 404 and empty-array responses — both mean
// the URL is not in the directory.
type AttemptResult =
  | { kind: 'ok'; info: StationInfo | null }
  | { kind: 'retry' };

async function fetchStationOnce(
  host: string,
  streamUri: string,
): Promise<AttemptResult> {
  const url = `${host}/json/stations/byurl`;
  const body = `url=${encodeURIComponent(streamUri)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        'user-agent': USER_AGENT,
      },
      body,
      signal: controller.signal,
    });
    if (res.status >= 500) return { kind: 'retry' };
    if (res.status >= 400) return { kind: 'ok', info: null };
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return { kind: 'retry' };
    }
    return { kind: 'ok', info: mapApiResponse(parsed) };
  } catch {
    // Network error, AbortError, etc. — all retryable.
    return { kind: 'retry' };
  } finally {
    clearTimeout(timer);
  }
}

// Look up a single stream URI by exact URL. Tries up to two hosts in
// order, then gives up. Never throws.
async function fetchStationByUrl(
  streamUri: string,
): Promise<StationInfo | null> {
  const hosts = await getApiHosts();
  if (hosts.length === 0) return null;
  const attempts = Math.min(2, hosts.length);
  for (let i = 0; i < attempts; i++) {
    const r = await fetchStationOnce(hosts[i]!, streamUri);
    if (r.kind === 'ok') return r.info;
    // retry: continue
  }
  console.warn(
    `radio-browser: lookup failed for ${streamUri} after ${attempts} attempt(s)`,
  );
  return null;
}

// One GET search attempt against one host. Mirrors fetchStationOnce's
// ok/retry semantics; search is a GET (the query is in the URL), not a
// POST.
async function fetchSearchOnce(url: string): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: controller.signal,
    });
    if (res.status >= 500) return { kind: 'retry' };
    if (res.status >= 400) return { kind: 'ok', info: null };
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return { kind: 'retry' };
    }
    return { kind: 'ok', info: mapApiResponse(parsed) };
  } catch {
    return { kind: 'retry' };
  } finally {
    clearTimeout(timer);
  }
}

// Search the directory by station name, taking the highest-voted online
// station. Used as a fallback when an exact byurl match is unavailable.
export async function fetchStationByName(
  name: string,
): Promise<StationInfo | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const hosts = await getApiHosts();
  if (hosts.length === 0) return null;
  const qs =
    `name=${encodeURIComponent(trimmed)}` +
    `&order=votes&reverse=true&hidebroken=true&limit=1`;
  const attempts = Math.min(2, hosts.length);
  for (let i = 0; i < attempts; i++) {
    const r = await fetchSearchOnce(`${hosts[i]!}/json/stations/search?${qs}`);
    if (r.kind === 'ok') return r.info;
  }
  return null;
}

// Public: byurl first (exact), then name search (fuzzy) when a Name tag is
// available. Never throws.
export async function fetchStation(
  streamUri: string,
  name?: string,
): Promise<StationInfo | null> {
  const byUrl = await fetchStationByUrl(streamUri);
  if (byUrl) return byUrl;
  if (name && name.trim()) return fetchStationByName(name);
  return null;
}

// ---- Persistent cache ----

export type CachedEntry = {
  hit: boolean;
  info: StationInfo | null;
  fetchedAt: number; // ms epoch
};

type CacheFile = {
  version: 1;
  entries: Record<
    string,
    {
      hit: boolean;
      info?: StationInfo;
      fetchedAt: number;
    }
  >;
};

const CACHE_VERSION = 1;

let cacheMap: Map<string, CachedEntry> | null = null;
let cachePath: string | null = null;
let loadedFromDisk = false;
let flushTimer: NodeJS.Timeout | null = null;
let pendingFlush: Promise<void> | null = null;

function getCachePath(): string {
  if (cachePath) return cachePath;
  cachePath = join(cacheDir(process.env), CACHE_FILE_NAME);
  return cachePath;
}

export function _setCachePathForTests(path: string): void {
  cachePath = path;
  loadedFromDisk = false;
  cacheMap = null;
}

function ensureMap(): Map<string, CachedEntry> {
  if (!cacheMap) cacheMap = new Map();
  return cacheMap;
}

// Load the cache file synchronously into memory. Idempotent — only
// the first call does I/O. All failure modes (missing file, corrupt
// JSON, wrong version) reset to an empty in-memory map; the next
// flush overwrites the bad file.
export async function loadCacheFromDisk(): Promise<void> {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  const path = getCachePath();
  ensureMap();
  if (!existsSync(path)) return;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CacheFile>;
    if (parsed.version !== CACHE_VERSION || !parsed.entries) return;
    const now = clock();
    for (const [k, v] of Object.entries(parsed.entries)) {
      // Per-entry defensiveness: tolerate junk values inside an
      // otherwise-valid v1 file without aborting the whole load.
      if (typeof v !== 'object' || v === null) continue;
      const hit = !!v.hit;
      const fetchedAt = typeof v.fetchedAt === 'number' ? v.fetchedAt : 0;
      // Drop expired entries on load: this is our only eviction hook,
      // so without it the on-disk file grows unboundedly across process
      // lifetimes (every URI ever seen accumulates forever).
      const ttl = hit ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
      if (now - fetchedAt > ttl) continue;
      // Drop malformed positive entries (hit=true with no usable info).
      // Storing them would break the `hit === true ⇒ info !== null`
      // invariant that downstream consumers (lookupStations, UI) rely
      // on; safer to treat them as never-cached and refetch.
      if (hit && (typeof v.info !== 'object' || v.info === null)) continue;
      cacheMap!.set(k, {
        hit,
        info: hit ? v.info! : null,
        fetchedAt,
      });
    }
  } catch (e) {
    console.warn(
      'radio-browser: failed to read cache, starting fresh:',
      e instanceof Error ? e.message : String(e),
    );
    cacheMap = new Map();
  }
}

// Look up an entry, honouring TTLs. Returns null when absent OR expired.
// Callers should treat null as "must refetch".
export function cacheGet(uri: string): CachedEntry | null {
  if (!cacheMap) return null;
  const e = cacheMap.get(uri);
  if (!e) return null;
  const ttl = e.hit ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  if (clock() - e.fetchedAt > ttl) return null;
  return e;
}

// Record a result. `info === null` means negative ("looked, no match").
// Schedules a debounced flush; callers don't need to await anything.
export function cachePut(uri: string, info: StationInfo | null): void {
  const map = ensureMap();
  map.set(uri, {
    hit: info !== null,
    info,
    fetchedAt: clock(),
  });
  scheduleFlush();
}

const FLUSH_DEBOUNCE_MS = 500;

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushCacheToDisk();
  }, FLUSH_DEBOUNCE_MS);
  // Don't keep the event loop alive just for this debounce.
  if (typeof (flushTimer as { unref?: () => void }).unref === 'function') {
    (flushTimer as { unref: () => void }).unref();
  }
}

// Write the in-memory cache to disk atomically. Concurrent calls
// coalesce onto the same write — we never have two writes racing.
export async function flushCacheToDisk(): Promise<void> {
  if (pendingFlush) return pendingFlush;
  if (!cacheMap) return;
  const path = getCachePath();
  const snapshot: CacheFile = {
    version: CACHE_VERSION,
    entries: {},
  };
  for (const [k, v] of cacheMap) {
    snapshot.entries[k] = v.info
      ? { hit: v.hit, info: v.info, fetchedAt: v.fetchedAt }
      : { hit: v.hit, fetchedAt: v.fetchedAt };
  }
  pendingFlush = (async () => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(snapshot));
      renameSync(tmp, path);
    } catch (e) {
      console.warn(
        'radio-browser: failed to write cache:',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      pendingFlush = null;
    }
  })();
  return pendingFlush;
}

// ---- Public batch API ----

export type LookupResult = {
  cached: Map<string, StationInfo | null>;
};

// Batch-lookup stream URIs. Each item carries the stream URI and an
// optional MPD Name tag, which is threaded into fetchStation as the
// name-search fallback when the exact byurl match misses. Mirrors
// fetchAlbumArtBatch in albumart.ts:
//   * cached entries returned grouped on the resolved value (one bulk
//     setState in the caller)
//   * misses streamed via onResolve in completion order
//   * per-URI errors never abort the batch
//   * concurrency capped at MAX_CONCURRENCY
//
// onResolve contract: called synchronously (NOT awaited) once per miss
// from inside a worker. It MUST NOT throw — a thrown callback would
// reject the worker promise, leak the in-flight fetches of the other
// workers, and leave their cachePut side-effects unreported. Wrap any
// fallible work the caller wants to do inside its own try/catch.
//
// Loads the persistent cache on first call (idempotent). Callers do
// NOT need to await loadCacheFromDisk separately.
export async function lookupStations(
  items: Array<{ uri: string; name?: string }>,
  onResolve: (uri: string, info: StationInfo | null) => void,
): Promise<LookupResult> {
  await loadCacheFromDisk();

  // Dedup by URI, preserving first-seen order and the first-seen name.
  // Note: a URI cached as a negative (no match) won't be retried even if a
  // later sighting carries a Name tag — MPD Name tags are stable per stream,
  // so first-seen virtually always has the name when one exists.
  const seen = new Set<string>();
  const unique: Array<{ uri: string; name?: string }> = [];
  for (const it of items) {
    if (!seen.has(it.uri)) {
      seen.add(it.uri);
      unique.push(it);
    }
  }

  // Partition: cached vs misses.
  const cached = new Map<string, StationInfo | null>();
  const misses: Array<{ uri: string; name?: string }> = [];
  for (const it of unique) {
    const e = cacheGet(it.uri);
    if (e) cached.set(it.uri, e.info);
    else misses.push(it);
  }

  if (misses.length === 0) return { cached };

  // Worker pool.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const i = next++;
      if (i >= misses.length) return;
      const { uri, name } = misses[i]!;
      let info: StationInfo | null = null;
      try {
        info = await fetchStation(uri, name);
      } catch {
        info = null;
      }
      cachePut(uri, info);
      onResolve(uri, info);
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(MAX_CONCURRENCY, misses.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return { cached };
}

// ---- Favicon download ----

// Download a station favicon into the albumart cache directory, keyed
// by the STREAM URI hash (so QueueList's existing artByUri[uri] picks
// it up automatically). Returns the on-disk path on success, null on
// any failure. Idempotent: a cache hit short-circuits the HTTP call so
// repeat invocations across queue refreshes cost zero.
export async function downloadStationFavicon(
  streamUri: string,
  faviconUrl: string,
): Promise<string | null> {
  const dir = cacheDir(process.env);
  // Favicon is the lowest-priority source; if any slot already exists
  // (embedded, webradiodb, or a prior favicon) keep it and skip the GET.
  const existing = findStreamArt(dir, streamUri);
  if (existing) return existing.path;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
  try {
    const res = await fetchImpl(faviconUrl, {
      headers: { 'user-agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const headerCt = res.headers.get('content-type') ?? undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isValidImage(buf, headerCt)) return null;
    // Prefer the real signature over a possibly-wrong/absent header.
    const mime = sniffImageType(buf) ?? headerCt;
    const path = streamArtCachePath(dir, streamUri, 'favicon', mime);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buf);
    return path;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
