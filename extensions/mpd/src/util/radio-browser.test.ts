import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync as mkdirSyncFs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { _resetMemoryCacheForTests } from '../mpd/albumart.js';
import {
  POSITIVE_TTL_MS,
  NEGATIVE_TTL_MS,
  LOOKUP_TIMEOUT_MS,
  MAX_CONCURRENCY,
  HOSTS_TTL_MS,
  FAVICON_TIMEOUT_MS,
  USER_AGENT,
  DEFAULT_FALLBACK_HOST,
  CACHE_FILE_NAME,
  mapApiResponse,
  pickBestEntry,
  getApiHosts,
  fetchStation,
  fetchStationByName,
  lookupStations,
  downloadStationFavicon,
  cacheGet,
  cachePut,
  loadCacheFromDisk,
  flushCacheToDisk,
  _setHostsForTests,
  _setSrvResolverForTests,
  _setClockForTests,
  _setFetchForTests,
  _setCachePathForTests,
  _resetForTests,
  type StationInfo,
} from './radio-browser.js';

test('constants are exported with sane values', () => {
  assert.equal(POSITIVE_TTL_MS, 7 * 24 * 3600 * 1000);
  assert.equal(NEGATIVE_TTL_MS, 1 * 24 * 3600 * 1000);
  assert.ok(LOOKUP_TIMEOUT_MS >= 1000 && LOOKUP_TIMEOUT_MS <= 10_000);
  assert.ok(MAX_CONCURRENCY >= 1 && MAX_CONCURRENCY <= 16);
  assert.equal(HOSTS_TTL_MS, 60 * 60 * 1000);
  assert.ok(FAVICON_TIMEOUT_MS >= 1000 && FAVICON_TIMEOUT_MS <= 10_000);
  assert.match(USER_AGENT, /^vicinae-mpd\//);
  assert.match(DEFAULT_FALLBACK_HOST, /^https:\/\//);
  assert.equal(CACHE_FILE_NAME, 'radio-browser.json');
});

test('StationInfo type compiles with optional fields', () => {
  const a: StationInfo = { name: 'Foo' };
  const b: StationInfo = { name: 'Bar', faviconUrl: 'https://x/i.png', homepage: 'https://x' };
  assert.equal(a.name, 'Foo');
  assert.equal(b.faviconUrl, 'https://x/i.png');
});

test('pickBestEntry returns null for empty input', () => {
  assert.equal(pickBestEntry([]), null);
});

test('pickBestEntry returns the only entry when length is 1', () => {
  const e = { name: 'Foo', votes: 5, favicon: '', homepage: '' };
  assert.equal(pickBestEntry([e]), e);
});

test('pickBestEntry returns the highest-votes entry when there are multiple entries', () => {
  const a = { name: 'Low', votes: 1, favicon: '', homepage: '' };
  const b = { name: 'High', votes: 99, favicon: '', homepage: '' };
  const c = { name: 'Mid', votes: 50, favicon: '', homepage: '' };
  assert.equal(pickBestEntry([a, b, c]), b);
});

test('pickBestEntry tolerates missing votes (treats as 0)', () => {
  // Typed explicitly so the object-literal "no overlap" check doesn't
  // fire on the votes-less entry; in real use the data is `unknown`.
  const a: { name: string; favicon: string; homepage: string; votes?: number } = {
    name: 'NoVotes',
    favicon: '',
    homepage: '',
  };
  const b = { name: 'Has', votes: 3, favicon: '', homepage: '' };
  assert.equal(pickBestEntry([a, b]), b);
});

test('mapApiResponse returns null for non-arrays and empty arrays', () => {
  assert.equal(mapApiResponse(null), null);
  assert.equal(mapApiResponse(undefined), null);
  assert.equal(mapApiResponse({}), null);
  assert.equal(mapApiResponse('not an array'), null);
  assert.equal(mapApiResponse([]), null);
});

test('mapApiResponse extracts name, favicon, homepage', () => {
  const info = mapApiResponse([
    {
      name: 'Best Radio',
      favicon: 'https://example.com/icon.png',
      homepage: 'https://example.com',
      votes: 42,
    },
  ]);
  assert.deepEqual(info, {
    name: 'Best Radio',
    faviconUrl: 'https://example.com/icon.png',
    homepage: 'https://example.com',
  });
});

test('mapApiResponse omits empty optional fields', () => {
  const info = mapApiResponse([
    { name: 'Bare', favicon: '', homepage: '', votes: 1 },
  ]);
  assert.deepEqual(info, { name: 'Bare' });
});

test('mapApiResponse returns null when the best entry has no name', () => {
  const info = mapApiResponse([
    { name: '', favicon: 'https://x', homepage: '', votes: 99 },
  ]);
  assert.equal(info, null);
});

test('mapApiResponse trims whitespace from name', () => {
  const info = mapApiResponse([
    { name: '  Padded  ', favicon: '', homepage: '', votes: 1 },
  ]);
  assert.equal(info!.name, 'Padded');
});

test('getApiHosts returns env override when RADIO_BROWSER_API is set', async () => {
  _resetForTests();
  const orig = process.env.RADIO_BROWSER_API;
  process.env.RADIO_BROWSER_API = 'https://my.mirror.example';
  try {
    const hosts = await getApiHosts();
    assert.deepEqual(hosts, ['https://my.mirror.example']);
  } finally {
    if (orig === undefined) delete process.env.RADIO_BROWSER_API;
    else process.env.RADIO_BROWSER_API = orig;
  }
});

test('getApiHosts resolves SRV records and prefixes https://', async () => {
  _resetForTests();
  _setSrvResolverForTests(async () => [
    { name: 'fi1.api.radio-browser.info.', port: 443, priority: 0, weight: 0 },
    { name: 'de1.api.radio-browser.info.', port: 443, priority: 0, weight: 0 },
  ]);
  const hosts = await getApiHosts();
  assert.equal(hosts.length, 2);
  for (const h of hosts) {
    assert.ok(h.startsWith('https://'));
    assert.ok(!h.endsWith('.'));
  }
});

test('getApiHosts falls back to the default host when SRV throws', async () => {
  _resetForTests();
  _setSrvResolverForTests(async () => {
    throw new Error('NXDOMAIN');
  });
  const hosts = await getApiHosts();
  assert.deepEqual(hosts, [DEFAULT_FALLBACK_HOST]);
});

test('getApiHosts falls back to the default host when SRV returns no records', async () => {
  _resetForTests();
  _setSrvResolverForTests(async () => []);
  const hosts = await getApiHosts();
  assert.deepEqual(hosts, [DEFAULT_FALLBACK_HOST]);
});

test('getApiHosts caches resolution within HOSTS_TTL_MS', async () => {
  _resetForTests();
  let calls = 0;
  _setSrvResolverForTests(async () => {
    calls++;
    return [{ name: 'a.example.', port: 443, priority: 0, weight: 0 }];
  });
  let now = 1_000_000;
  _setClockForTests(() => now);
  await getApiHosts();
  await getApiHosts();
  now += HOSTS_TTL_MS - 1;
  await getApiHosts();
  assert.equal(calls, 1);
});

test('getApiHosts re-resolves after HOSTS_TTL_MS elapses', async () => {
  _resetForTests();
  let calls = 0;
  _setSrvResolverForTests(async () => {
    calls++;
    return [{ name: 'a.example.', port: 443, priority: 0, weight: 0 }];
  });
  let now = 1_000_000;
  _setClockForTests(() => now);
  await getApiHosts();
  now += HOSTS_TTL_MS + 1;
  await getApiHosts();
  assert.equal(calls, 2);
});

test('_setHostsForTests pre-populates the cache so SRV is never called', async () => {
  _resetForTests();
  let calls = 0;
  _setSrvResolverForTests(async () => {
    calls++;
    return [];
  });
  _setHostsForTests(['https://stub1.example', 'https://stub2.example']);
  const hosts = await getApiHosts();
  assert.deepEqual(hosts, ['https://stub1.example', 'https://stub2.example']);
  assert.equal(calls, 0);
});

// Helper to build a Response-shaped object the module accepts.
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('fetchStation returns StationInfo on a happy path', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example']);
  const calls: { url: string; init?: RequestInit }[] = [];
  _setFetchForTests(async (url, init) => {
    calls.push({ url: String(url), init });
    return jsonResponse([
      { name: 'Best', favicon: 'https://x/i.png', homepage: 'https://x', votes: 9 },
    ]);
  });
  const info = await fetchStation('http://stream.example/abc');
  assert.deepEqual(info, {
    name: 'Best',
    faviconUrl: 'https://x/i.png',
    homepage: 'https://x',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://host1.example/json/stations/byurl');
  const init = calls[0]!.init!;
  assert.equal(init.method, 'POST');
  assert.equal(
    (init.headers as Record<string, string>)['content-type'],
    'application/x-www-form-urlencoded',
  );
  assert.equal((init.headers as Record<string, string>)['user-agent'], USER_AGENT);
  assert.equal(
    init.body,
    'url=' + encodeURIComponent('http://stream.example/abc'),
  );
});

test('fetchStation returns null for empty array (no match)', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example']);
  _setFetchForTests(async () => jsonResponse([]));
  assert.equal(await fetchStation('http://stream.example/abc'), null);
});

test('fetchStation returns null on 404 without retry', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example', 'https://host2.example']);
  let calls = 0;
  _setFetchForTests(async () => {
    calls++;
    return new Response('not found', { status: 404 });
  });
  assert.equal(await fetchStation('http://stream.example/abc'), null);
  assert.equal(calls, 1);
});

test('fetchStation retries once on 500 against the next host and succeeds', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example', 'https://host2.example']);
  let calls = 0;
  _setFetchForTests(async (url) => {
    calls++;
    if (String(url).startsWith('https://host1.example')) {
      return new Response('boom', { status: 500 });
    }
    return jsonResponse([{ name: 'OK', favicon: '', homepage: '', votes: 1 }]);
  });
  const info = await fetchStation('http://stream.example/abc');
  assert.equal(info?.name, 'OK');
  assert.equal(calls, 2);
});

test('fetchStation retries once on network error against the next host', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example', 'https://host2.example']);
  let calls = 0;
  _setFetchForTests(async (url) => {
    calls++;
    if (String(url).startsWith('https://host1.example')) {
      throw new TypeError('network');
    }
    return jsonResponse([{ name: 'OK', votes: 1 }]);
  });
  const info = await fetchStation('http://stream.example/abc');
  assert.equal(info?.name, 'OK');
  assert.equal(calls, 2);
});

test('fetchStation returns null when both hosts fail', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example', 'https://host2.example']);
  _setFetchForTests(async () => new Response('boom', { status: 503 }));
  assert.equal(await fetchStation('http://stream.example/abc'), null);
});

test('fetchStation returns null on malformed JSON', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example']);
  _setFetchForTests(
    async () =>
      new Response('not json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  assert.equal(await fetchStation('http://stream.example/abc'), null);
});

test('fetchStation returns null on timeout (AbortController)', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example']);
  _setFetchForTests((_url, init) => {
    return new Promise((_resolve, reject) => {
      // Respect the signal — that's what the real fetch does.
      const signal = (init as { signal?: AbortSignal }).signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }
      // Never resolve otherwise.
    });
  });
  // LOOKUP_TIMEOUT_MS is 3s in prod; this test takes ~3s. Acceptable for one test.
  const start = Date.now();
  const info = await fetchStation('http://stream.example/abc');
  const elapsed = Date.now() - start;
  assert.equal(info, null);
  assert.ok(elapsed >= LOOKUP_TIMEOUT_MS - 50, `elapsed=${elapsed}ms`);
});

function tmpCachePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rb-cache-'));
  return join(dir, 'radio-browser.json');
}

test('fetchStationByName queries the search endpoint and maps the top entry', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example']);
  const calls: string[] = [];
  _setFetchForTests(async (url) => {
    calls.push(String(url));
    return jsonResponse([{ name: 'FIP', favicon: 'https://x/i.png', votes: 99 }]);
  });
  const info = await fetchStationByName('FIP');
  assert.equal(info?.name, 'FIP');
  assert.ok(calls[0]!.includes('/json/stations/search?'));
  assert.ok(calls[0]!.includes('name=FIP'));
  assert.ok(calls[0]!.includes('order=votes'));
  assert.ok(calls[0]!.includes('hidebroken=true'));
});

test('fetchStation falls back to name search when byurl returns no match', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example']);
  const urls: string[] = [];
  _setFetchForTests(async (url) => {
    urls.push(String(url));
    if (String(url).includes('/byurl')) return jsonResponse([]);
    return jsonResponse([{ name: 'FIP', votes: 5 }]);
  });
  const info = await fetchStation('http://stream/x', 'FIP');
  assert.equal(info?.name, 'FIP');
  assert.ok(urls.some((u) => u.includes('/byurl')));
  assert.ok(urls.some((u) => u.includes('/search?')));
});

test('fetchStation does NOT call name search when byurl matches', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example']);
  const urls: string[] = [];
  _setFetchForTests(async (url) => {
    urls.push(String(url));
    return jsonResponse([{ name: 'Direct', votes: 1 }]);
  });
  const info = await fetchStation('http://stream/x', 'FIP');
  assert.equal(info?.name, 'Direct');
  assert.ok(!urls.some((u) => u.includes('/search?')));
});

test('fetchStation does NOT call name search when no name is given and byurl misses', async () => {
  _resetForTests();
  _setHostsForTests(['https://host1.example']);
  const urls: string[] = [];
  _setFetchForTests(async (url) => {
    urls.push(String(url));
    return jsonResponse([]);
  });
  const info = await fetchStation('http://stream/x');
  assert.equal(info, null);
  assert.ok(!urls.some((u) => u.includes('/search?')));
});

test('lookupStations threads the name into the fallback', async () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  _setHostsForTests(['https://h']);
  _setClockForTests(() => 1_000_000);
  _setFetchForTests(async (url) => {
    if (String(url).includes('/byurl')) return jsonResponse([]);
    return jsonResponse([{ name: 'Named', votes: 1 }]);
  });
  const got = new Map<string, StationInfo | null>();
  await lookupStations([{ uri: 'http://s/x', name: 'Named' }], (u, i) => got.set(u, i));
  assert.deepEqual(got.get('http://s/x'), { name: 'Named' });
});

test('cacheGet returns null when nothing has been put', () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  assert.equal(cacheGet('http://nope'), null);
});

test('cachePut + cacheGet round-trips a positive entry', () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  let now = 1_000_000;
  _setClockForTests(() => now);
  cachePut('http://x', { name: 'Foo' });
  const got = cacheGet('http://x');
  assert.ok(got);
  assert.equal(got!.hit, true);
  assert.equal(got!.info!.name, 'Foo');
});

test('cachePut(null) records a negative entry', () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  let now = 1_000_000;
  _setClockForTests(() => now);
  cachePut('http://x', null);
  const got = cacheGet('http://x');
  assert.ok(got);
  assert.equal(got!.hit, false);
  assert.equal(got!.info, null);
});

test('cacheGet returns null when a positive entry is past POSITIVE_TTL_MS', () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  let now = 1_000_000;
  _setClockForTests(() => now);
  cachePut('http://x', { name: 'Foo' });
  now += POSITIVE_TTL_MS + 1;
  assert.equal(cacheGet('http://x'), null);
});

test('cacheGet returns null when a negative entry is past NEGATIVE_TTL_MS', () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  let now = 1_000_000;
  _setClockForTests(() => now);
  cachePut('http://x', null);
  now += NEGATIVE_TTL_MS + 1;
  assert.equal(cacheGet('http://x'), null);
});

test('flushCacheToDisk writes atomically and loadCacheFromDisk reads it back', async () => {
  const path = tmpCachePath();
  _resetForTests();
  _setCachePathForTests(path);
  let now = 1_000_000;
  _setClockForTests(() => now);
  cachePut('http://a', { name: 'A', faviconUrl: 'https://i', homepage: 'https://h' });
  cachePut('http://b', null);
  await flushCacheToDisk();
  assert.ok(existsSync(path));
  assert.ok(!existsSync(path + '.tmp'));
  // Re-load in a fresh module state and verify entries survive.
  _resetForTests();
  _setCachePathForTests(path);
  _setClockForTests(() => now);
  await loadCacheFromDisk();
  const a = cacheGet('http://a');
  const b = cacheGet('http://b');
  assert.ok(a);
  assert.equal(a!.hit, true);
  assert.equal(a!.info!.name, 'A');
  assert.equal(a!.info!.faviconUrl, 'https://i');
  assert.equal(a!.info!.homepage, 'https://h');
  assert.ok(b);
  assert.equal(b!.hit, false);
});

test('loadCacheFromDisk tolerates a missing file', async () => {
  _resetForTests();
  _setCachePathForTests(join(mkdtempSync(join(tmpdir(), 'rb-')), 'absent.json'));
  await loadCacheFromDisk(); // must not throw
  assert.equal(cacheGet('http://anything'), null);
});

test('loadCacheFromDisk tolerates corrupt JSON', async () => {
  const path = tmpCachePath();
  writeFileSync(path, 'this is not json{{{');
  _resetForTests();
  _setCachePathForTests(path);
  await loadCacheFromDisk();
  assert.equal(cacheGet('http://anything'), null);
});

test('loadCacheFromDisk tolerates a version mismatch', async () => {
  const path = tmpCachePath();
  writeFileSync(
    path,
    JSON.stringify({ version: 999, entries: { 'http://x': { hit: true, info: { name: 'X' }, fetchedAt: 1 } } }),
  );
  _resetForTests();
  _setCachePathForTests(path);
  await loadCacheFromDisk();
  assert.equal(cacheGet('http://x'), null);
});

test('flushCacheToDisk overwrites a previously corrupt file', async () => {
  const path = tmpCachePath();
  writeFileSync(path, 'garbage');
  _resetForTests();
  _setCachePathForTests(path);
  let now = 1_000_000;
  _setClockForTests(() => now);
  await loadCacheFromDisk();
  cachePut('http://x', { name: 'X' });
  await flushCacheToDisk();
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(raw.version, 1);
  assert.equal(raw.entries['http://x'].info.name, 'X');
});

test('loadCacheFromDisk drops expired entries (positive and negative)', async () => {
  // Without eviction-on-load, the cache file grows forever across
  // process restarts. Pre-seed the file with one fresh and two stale
  // entries; loader must keep only the fresh one.
  const path = tmpCachePath();
  const now = 10_000_000;
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      entries: {
        'http://fresh': { hit: true, info: { name: 'Fresh' }, fetchedAt: now - 1000 },
        'http://stale-positive': {
          hit: true,
          info: { name: 'Stale' },
          fetchedAt: now - POSITIVE_TTL_MS - 1,
        },
        'http://stale-negative': { hit: false, fetchedAt: now - NEGATIVE_TTL_MS - 1 },
      },
    }),
  );
  _resetForTests();
  _setCachePathForTests(path);
  _setClockForTests(() => now);
  await loadCacheFromDisk();
  assert.ok(cacheGet('http://fresh'));
  assert.equal(cacheGet('http://stale-positive'), null);
  assert.equal(cacheGet('http://stale-negative'), null);
});

test('loadCacheFromDisk drops malformed positive entries (hit=true with no info)', async () => {
  // The hit===true ⇒ info!==null invariant matters: downstream code
  // (Task 6 batch lookup, UI) assumes a positive entry has usable
  // info. A truncated write or future schema drift could violate it;
  // dropping the bad entry is safer than letting null leak through.
  const path = tmpCachePath();
  const now = 10_000_000;
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      entries: {
        'http://good': { hit: true, info: { name: 'Good' }, fetchedAt: now },
        'http://bad': { hit: true, fetchedAt: now }, // missing info
      },
    }),
  );
  _resetForTests();
  _setCachePathForTests(path);
  _setClockForTests(() => now);
  await loadCacheFromDisk();
  assert.ok(cacheGet('http://good'));
  assert.equal(cacheGet('http://bad'), null);
});

test('loadCacheFromDisk skips non-object entries without crashing', async () => {
  // Per-entry defensiveness: a stray null/number/string under a key
  // in an otherwise valid file shouldn't take down the whole load.
  const path = tmpCachePath();
  const now = 10_000_000;
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      entries: {
        'http://good': { hit: true, info: { name: 'Good' }, fetchedAt: now },
        'http://junk1': null,
        'http://junk2': 42,
        'http://junk3': 'string',
      },
    }),
  );
  _resetForTests();
  _setCachePathForTests(path);
  _setClockForTests(() => now);
  await loadCacheFromDisk();
  assert.ok(cacheGet('http://good'));
  assert.equal(cacheGet('http://junk1'), null);
  assert.equal(cacheGet('http://junk2'), null);
  assert.equal(cacheGet('http://junk3'), null);
});

test('lookupStations returns all cached hits in the grouped map, no fetch', async () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  _setHostsForTests(['https://h']);
  let now = 1_000_000;
  _setClockForTests(() => now);
  let fetchCalls = 0;
  _setFetchForTests(async () => {
    fetchCalls++;
    return jsonResponse([]);
  });
  cachePut('http://a', { name: 'A' });
  cachePut('http://b', null);
  const onResolve: Array<[string, unknown]> = [];
  const result = await lookupStations([{ uri: 'http://a' }, { uri: 'http://b' }], (u, i) =>
    onResolve.push([u, i]),
  );
  assert.equal(fetchCalls, 0);
  assert.equal(onResolve.length, 0);
  assert.equal(result.cached.size, 2);
  assert.deepEqual(result.cached.get('http://a'), { name: 'A' });
  assert.equal(result.cached.get('http://b'), null);
});

test('lookupStations streams misses via onResolve and caches results', async () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  _setHostsForTests(['https://h']);
  _setClockForTests(() => 1_000_000);
  _setFetchForTests(async (url, init) => {
    const body = String((init as { body?: string }).body ?? '');
    const m = body.match(/^url=(.+)$/);
    const uri = m ? decodeURIComponent(m[1]!) : '';
    if (uri === 'http://known') {
      return jsonResponse([{ name: 'Known', votes: 1 }]);
    }
    return jsonResponse([]); // unknown -> negative
  });
  const onResolve: Array<[string, StationInfo | null]> = [];
  const result = await lookupStations(
    [{ uri: 'http://known' }, { uri: 'http://unknown' }],
    (u, i) => onResolve.push([u, i]),
  );
  assert.equal(result.cached.size, 0);
  assert.equal(onResolve.length, 2);
  const map = new Map(onResolve);
  assert.deepEqual(map.get('http://known'), { name: 'Known' });
  assert.equal(map.get('http://unknown'), null);
  // Both should now be cached.
  assert.deepEqual(cacheGet('http://known')!.info, { name: 'Known' });
  assert.equal(cacheGet('http://unknown')!.info, null);
});

test('lookupStations deduplicates input URIs', async () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  _setHostsForTests(['https://h']);
  _setClockForTests(() => 1_000_000);
  let fetchCalls = 0;
  _setFetchForTests(async () => {
    fetchCalls++;
    return jsonResponse([{ name: 'X', votes: 1 }]);
  });
  await lookupStations([{ uri: 'http://x' }, { uri: 'http://x' }, { uri: 'http://x' }], () => {});
  assert.equal(fetchCalls, 1);
});

test('lookupStations respects MAX_CONCURRENCY', async () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  _setHostsForTests(['https://h']);
  _setClockForTests(() => 1_000_000);
  let inFlight = 0;
  let maxInFlight = 0;
  _setFetchForTests(async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return jsonResponse([{ name: 'X', votes: 1 }]);
  });
  const uris = Array.from({ length: 16 }, (_, i) => `http://s/${i}`);
  await lookupStations(uris.map((uri) => ({ uri })), () => {});
  // MAX_CONCURRENCY is 4
  assert.ok(maxInFlight <= 4, `maxInFlight=${maxInFlight}`);
});

test('lookupStations returns empty result immediately for empty input', async () => {
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  let fetchCalls = 0;
  _setFetchForTests(async () => {
    fetchCalls++;
    return jsonResponse([]);
  });
  const onResolve: unknown[] = [];
  const result = await lookupStations([], (u, i) => onResolve.push([u, i]));
  assert.equal(result.cached.size, 0);
  assert.equal(onResolve.length, 0);
  assert.equal(fetchCalls, 0);
});

test('lookupStations does not abort on per-URI failure', async () => {
  // Two hosts so fetchStation's per-URI retry path is exercised within
  // the batch — verifies the batch isn't confused when one URI
  // internally fails over and the other succeeds outright.
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  _setHostsForTests(['https://h1', 'https://h2']);
  _setClockForTests(() => 1_000_000);
  let boomCalls = 0;
  _setFetchForTests(async (url, init) => {
    const body = String((init as { body?: string }).body ?? '');
    if (body.includes('boom')) {
      boomCalls++;
      throw new Error('network');
    }
    return jsonResponse([{ name: 'OK', votes: 1 }]);
  });
  const onResolve: Array<[string, StationInfo | null]> = [];
  await lookupStations([{ uri: 'http://boom' }, { uri: 'http://ok' }], (u, i) =>
    onResolve.push([u, i]),
  );
  assert.equal(onResolve.length, 2);
  // boom fails on h1, retries on h2, fails again → null result.
  assert.equal(boomCalls, 2);
  const map = new Map(onResolve);
  assert.equal(map.get('http://boom'), null);
  assert.deepEqual(map.get('http://ok'), { name: 'OK' });
});

test('lookupStations calls onResolve exactly once per unique URI even with duplicates', () => {
  // Dedup is observable: a caller passing 3x the same URI sees one
  // resolve callback, not three (paired with the existing dedup test
  // that asserts only 1 fetch call).
  _resetForTests();
  _setCachePathForTests(tmpCachePath());
  _setHostsForTests(['https://h']);
  _setClockForTests(() => 1_000_000);
  _setFetchForTests(async () => jsonResponse([{ name: 'X', votes: 1 }]));
  let resolveCount = 0;
  return lookupStations(
    [{ uri: 'http://x' }, { uri: 'http://x' }, { uri: 'http://x' }],
    () => resolveCount++,
  ).then(() => assert.equal(resolveCount, 1));
});

function pngResponse(extra: number[] = []): Response {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const bytes = [...sig, ...new Array(120).fill(0), ...extra];
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

function hashOf(uri: string): string {
  return createHash('sha1').update(uri).digest('hex');
}

test('downloadStationFavicon writes the image to the album-art cache dir', async () => {
  _resetForTests();
  _resetMemoryCacheForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'rb-art-'));
  const origCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(async () => pngResponse([1, 2, 3, 4]));
    const path = await downloadStationFavicon(
      'http://stream.example/abc',
      'https://example.com/icon.png',
    );
    assert.ok(path);
    assert.ok(path!.endsWith('.favicon.png'));
    const expected = join(
      artDir,
      'vicinae-mpd',
      'art',
      `${hashOf('http://stream.example/abc')}.favicon.png`,
    );
    assert.equal(path, expected);
    const expectedBytes = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...new Array(120).fill(0),
      1, 2, 3, 4,
    ];
    assert.deepEqual(Array.from(readFileSync(path!)), expectedBytes);
  } finally {
    if (origCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = origCache;
  }
});

test('downloadStationFavicon returns null on non-2xx response', async () => {
  _resetForTests();
  _resetMemoryCacheForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'rb-art-'));
  const origCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(async () => new Response('not found', { status: 404 }));
    const path = await downloadStationFavicon(
      'http://stream.example/abc',
      'https://example.com/icon.png',
    );
    assert.equal(path, null);
  } finally {
    if (origCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = origCache;
  }
});

test('downloadStationFavicon returns null and swallows network errors', async () => {
  _resetForTests();
  _resetMemoryCacheForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'rb-art-'));
  const origCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(async () => {
      throw new TypeError('network');
    });
    const path = await downloadStationFavicon(
      'http://stream.example/abc',
      'https://example.com/icon.png',
    );
    assert.equal(path, null);
  } finally {
    if (origCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = origCache;
  }
});

test('downloadStationFavicon skips the download when a cache file already exists', async () => {
  _resetForTests();
  _resetMemoryCacheForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'rb-art-'));
  const origCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    // Pre-seed the cache directory with a favicon-slot file for this URI.
    const expectedDir = join(artDir, 'vicinae-mpd', 'art');
    mkdirSyncFs(expectedDir, { recursive: true });
    const seeded = join(
      expectedDir,
      `${hashOf('http://stream.example/abc')}.favicon.jpg`,
    );
    const seededBytes = Buffer.alloc(120);
    writeFileSync(seeded, seededBytes);
    let fetchCalls = 0;
    _setFetchForTests(async () => {
      fetchCalls++;
      return pngResponse([1, 2, 3]);
    });
    const path = await downloadStationFavicon(
      'http://stream.example/abc',
      'https://example.com/icon.png',
    );
    assert.equal(path, seeded);
    assert.equal(fetchCalls, 0);
    // Existing file content is untouched.
    assert.deepEqual(Array.from(readFileSync(seeded)), Array.from(seededBytes));
  } finally {
    if (origCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = origCache;
  }
});

test('downloadStationFavicon returns null when the request aborts (timeout wiring)', async () => {
  // Verifies the AbortController is actually plumbed into fetchImpl so
  // a regression in signal wiring (e.g. forgetting to pass the signal)
  // would surface here instead of silently letting requests run forever.
  _resetForTests();
  _resetMemoryCacheForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'rb-art-'));
  const origCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as { signal?: AbortSignal }).signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }
          // Never resolves otherwise; only the abort path completes
          // the promise. Test takes ~FAVICON_TIMEOUT_MS to run.
        }),
    );
    const start = Date.now();
    const path = await downloadStationFavicon(
      'http://stream.example/abc',
      'https://example.com/icon.png',
    );
    const elapsed = Date.now() - start;
    assert.equal(path, null);
    assert.ok(
      elapsed >= FAVICON_TIMEOUT_MS - 50,
      `elapsed=${elapsed}ms (expected >= ${FAVICON_TIMEOUT_MS - 50})`,
    );
  } finally {
    if (origCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = origCache;
  }
});

test('downloadStationFavicon falls back to .jpg extension when response has no content-type', async () => {
  // When the response omits Content-Type, the sniffed signature decides
  // the extension; a JPEG body yields .favicon.jpg. Covers the
  // real-world case where some CDNs omit the Content-Type header.
  _resetForTests();
  _resetMemoryCacheForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'rb-art-'));
  const origCache = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    const jpeg = [0xff, 0xd8, 0xff, 0xe0, ...new Array(120).fill(0)];
    _setFetchForTests(
      async () =>
        // No content-type header on the response.
        new Response(new Uint8Array(jpeg), { status: 200 }),
    );
    const path = await downloadStationFavicon(
      'http://stream.example/abc',
      'https://example.com/icon',
    );
    assert.ok(path);
    assert.ok(path!.endsWith('.favicon.jpg'));
  } finally {
    if (origCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = origCache;
  }
});

test('downloadStationFavicon returns null when body is not an image', async () => {
  _resetForTests();
  _resetMemoryCacheForTests();
  const artDir = mkdtempSync(join(tmpdir(), 'rb-art-'));
  const orig = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = artDir;
  try {
    _setFetchForTests(async () =>
      new Response('<!DOCTYPE html><html>err</html>', {
        status: 200, headers: { 'content-type': 'text/html' },
      }),
    );
    const path = await downloadStationFavicon(
      'http://stream.example/abc', 'https://example.com/icon.png',
    );
    assert.equal(path, null);
  } finally {
    if (orig === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = orig;
  }
});

test('FAVICON_TIMEOUT_MS is exported and sane', () => {
  assert.ok(FAVICON_TIMEOUT_MS >= 1000 && FAVICON_TIMEOUT_MS <= 10_000);
});
