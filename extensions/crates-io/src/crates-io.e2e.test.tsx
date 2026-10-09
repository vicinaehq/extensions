/**
 * Live end-to-end coverage for crate search, details, symbols, and caching.
 *
 * @remarks
 * Exercises the public surface of `./api` against the production crates.io
 * and docs.rs endpoints, plus the pure display helpers in `./search-crates`
 * and `./format`. Cache assertions use the filesystem-backed `Cache` from
 * `@raycast/api` under the `crates-v2` namespace.
 *
 * Isolation: `beforeEach` points `globalThis.vicinae.environ.supportPath` at
 * a fresh temporary directory, provides fresh preferences and a navigation
 * context for `Action.Push`, and re-imports `./api`, so each test starts
 * with an empty persistent cache. `afterEach` removes the directory.
 *
 * Requires network access to `https://crates.io` and `https://docs.rs`.
 * Per-test timeout is 30s (see `vite.config.ts`); symbol tests poll up to
 * 25s for docs.rs fetches to settle.
 */
import { channel } from "node:diagnostics_channel";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Crate, SymbolDetails, SymbolItem } from "./api";
import type { ActionEntry } from "./search-crates";

/** API surface under test, rebound by `beforeEach` after a module reset. */
type Api = typeof import("./api");

/** `[symbols, loading, error]` tuple returned by `useCrateSymbols`. */
type SymbolsState = ReturnType<Api["useCrateSymbols"]>;

/**
 * Minimal host shim providing the globals the API runtime reads.
 *
 * @remarks
 * `vite.config.ts` aliases `@raycast/api` to the Vicinae runtime in tests,
 * so the shim lives on `globalThis.vicinae`: `environ.supportPath` selects
 * the cache directory; `preferences` feeds `getPreferenceValues`;
 * `navigationContext` backs `useNavigation` for `Action.Push`; `client.UI`
 * records the toasts the command shows. The context is rebuilt in
 * `beforeEach` after `vi.resetModules()` so it matches the fresh React
 * instance.
 */
/** One `UI/showToast` call recorded by the host shim. */
interface RecordedToast {
  id: string;
  title: string;
  message: string;
  style: string;
}

/** Toasts shown during the current test, in call order. */
let toasts: RecordedToast[] = [];

const host = {
  environ: { supportPath: "" },
  preferences: { defaultOpenAction: "viewOnCratesIo" },
  navigationContext: undefined as unknown,
  client: {
    UI: {
      showToast: async (id: string, title: string, message: string, style: string) => {
        toasts.push({ id, title, message, style });
      },
      hideToast: async () => {},
    },
  },
};

/** `globalThis` augmented with the host shim and React act flag. */
type TestGlobals = typeof globalThis & {
  vicinae?: typeof host;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
(globalThis as TestGlobals).vicinae = host;
(globalThis as TestGlobals).IS_REACT_ACT_ENVIRONMENT = true;

/** Temporary `supportPath` for the current test; removed in `afterEach`. */
let cacheDir: string;

/** Fresh `./api` module instance bound to the current `cacheDir`. */
let api: Api;

beforeEach(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), "crates-v2-e2e-"));
  host.environ.supportPath = cacheDir;
  host.preferences.defaultOpenAction = "viewOnCratesIo";
  toasts = [];
  vi.resetModules();
  const { createContext } = await import("react");
  host.navigationContext = createContext({ push: () => {}, pop: () => {} });
  api = await import("./api");
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

/** Narrows a nullable lookup result to a non-null value. */
function must<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${label} to be present`);
  }
  return value;
}

/** Opens a second handle on the `crates-v2` namespace, independent of the module-level `Cache`. */
async function openCache() {
  const { Cache } = await import("@raycast/api");
  return new Cache({ namespace: "crates-v2" });
}

/** Renders `useCrateSymbols` in isolation and exposes its lifecycle. */
async function mountSymbolsHook(crate: Crate) {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.createElement("div"));
  let state: SymbolsState = [null, true, null];

  function Probe() {
    state = api.useCrateSymbols(crate);
    return null;
  }

  await act(async () => {
    root.render(<Probe />);
  });

  return {
    /** Latest `[symbols, loading, error]` tuple from the mounted hook. */
    get state(): SymbolsState {
      return state;
    },
    /** Polls until `loading` clears or the timeout elapses. */
    async settled(timeoutMs = 25_000): Promise<SymbolsState> {
      const deadline = Date.now() + timeoutMs;
      while (state[1] && Date.now() < deadline) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
        });
      }
      return state;
    },
    /** Unmounts the probe root inside `act`. */
    async unmount(): Promise<void> {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

/**
 * Reads React's stored props for a rendered host element.
 *
 * API components render as unknown DOM tags in jsdom, so handlers are only
 * reachable through the internal `__reactProps$…` property.
 */
function reactProps(element: Element): Record<string, unknown> {
  const key = Object.keys(element).find((candidate) => candidate.startsWith("__reactProps$"));
  return key ? (element as unknown as Record<string, Record<string, unknown>>)[key] : {};
}

/** Sleeps real wall-clock time inside `act`, flushing effect state updates. */
async function tick(ms: number): Promise<void> {
  const { act } = await import("react");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Polls `read` every 100ms until it returns a truthy value. */
async function waitFor<T>(
  read: () => T,
  label: string,
  timeoutMs = 25_000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value as NonNullable<T>;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await tick(100);
  }
}

/** Mounts `node` into `document.body` and exposes the container for queries. */
async function render(node: ReactNode) {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const root = createRoot(mount);
  await act(async () => {
    root.render(node);
  });
  return {
    mount,
    /** Unmounts the root and detaches the container. */
    async unmount(): Promise<void> {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
    },
  };
}

/** Types `value` into the rendered search bar through React's stored props. */
async function typeSearch(container: Element, value: string): Promise<void> {
  const { act } = await import("react");
  const list = must(container.querySelector("list"), "search list");
  await act(async () => {
    (reactProps(list).onSearchTextChange as (value: string) => void)(value);
  });
}

/** Changes the selected row through React's stored props. */
async function selectRow(container: Element, id: string): Promise<void> {
  const { act } = await import("react");
  const list = must(container.querySelector("list"), "search list");
  await act(async () => {
    (reactProps(list).onSelectionChange as (id: string) => void)(id);
  });
}

/** Applies a category filter through the dropdown's stored props. */
async function selectDropdown(container: Element, value: string): Promise<void> {
  const { act } = await import("react");
  const dropdown = must(container.querySelector("dropdown"), "category dropdown");
  await act(async () => {
    (reactProps(dropdown).onChange as (value: string) => void)(value);
  });
}

/** `list-section` titles in render order (`null` for untitled sections). */
function sectionTitles(container: Element): Array<string | null> {
  return Array.from(container.querySelectorAll("list-section")).map((section) =>
    section.getAttribute("title"),
  );
}

/** Maps each `list-section` title to its row titles. */
function sectionRows(container: Element): Map<string | null, Array<string | null>> {
  return new Map(
    Array.from(container.querySelectorAll("list-section")).map((section) => [
      section.getAttribute("title"),
      Array.from(section.querySelectorAll("list-item")).map((item) => item.getAttribute("title")),
    ]),
  );
}

/** All `list-item` titles, in render order. */
function rowTitles(container: Element): Array<string | null> {
  return Array.from(container.querySelectorAll("list-item")).map((item) =>
    item.getAttribute("title"),
  );
}

/** All `action` titles within `scope`, in render order. */
function actionTitles(scope: Element): string[] {
  return Array.from(scope.querySelectorAll("action")).map(
    (action) => action.getAttribute("title") ?? "",
  );
}

/** Maps each `tag-list` title to its tag texts. */
function tagLists(container: Element): Map<string, string[]> {
  return new Map(
    Array.from(container.querySelectorAll("tag-list")).map((list) => [
      list.getAttribute("title") ?? "",
      Array.from(list.querySelectorAll("tag-item")).map((item) => item.getAttribute("text") ?? ""),
    ]),
  );
}

/** One observed undici request. */
interface ObservedRequest {
  method: string;
  url: string;
  at: number;
}

/**
 * Subscribes to Node's undici diagnostics channels as a live request observer.
 *
 * Observation only: the real fetches run unmodified, never intercepted or stubbed.
 */
function captureRequests() {
  const requests: ObservedRequest[] = [];
  const failures: Array<{ url: string; name: string }> = [];
  const created = channel("undici:request:create");
  const failed = channel("undici:request:error");

  const urlOf = (message: unknown): string | undefined => {
    const request = (message as { request?: { origin?: string; path?: string } }).request;
    return request ? `${request.origin ?? ""}${request.path ?? ""}` : undefined;
  };

  const onCreated = (message: unknown) => {
    const url = urlOf(message);
    if (!url) return;
    const method = (message as { request?: { method?: string } }).request?.method ?? "GET";
    requests.push({ method, url, at: Date.now() });
  };
  const onFailed = (message: unknown) => {
    const url = urlOf(message);
    if (!url) return;
    const name = (message as { error?: { name?: string } }).error?.name ?? "Error";
    failures.push({ url, name });
  };

  created.subscribe(onCreated);
  failed.subscribe(onFailed);

  return {
    requests,
    failures,
    /** Resolves with the first request matching `predicate`. */
    nextRequest(predicate: (url: string) => boolean, timeoutMs = 20_000): Promise<ObservedRequest> {
      const seen = requests.find((entry) => predicate(entry.url));
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          created.unsubscribe(listener);
          reject(new Error("Timed out waiting for a matching request"));
        }, timeoutMs);
        const listener = (message: unknown) => {
          const url = urlOf(message);
          if (!url || !predicate(url)) return;
          clearTimeout(timer);
          created.unsubscribe(listener);
          const method = (message as { request?: { method?: string } }).request?.method ?? "GET";
          resolve({ method, url, at: Date.now() });
        };
        created.subscribe(listener);
      });
    },
    /** Unsubscribes both diagnostics listeners. */
    stop(): void {
      created.unsubscribe(onCreated);
      failed.unsubscribe(onFailed);
    },
  };
}

/** Live crates.io/docs.rs contracts for search, details, symbols, and cache. */
describe("crates.io search live e2e", () => {
  /**
   * `getTopCrates` normalizes every `Crate` field.
   *
   * @remarks
   * Expects 1-50 results with non-empty names and versions, non-negative
   * download counters, at least one release, boolean flags, and the
   * registry's download-descending order.
   */
  it("1. top crates live fetch normalizes every field", async () => {
    const crates = await api.getTopCrates();

    expect(crates.length).toBeGreaterThanOrEqual(1);
    expect(crates.length).toBeLessThanOrEqual(50);

    for (const crate of crates) {
      expect(crate.name.length).toBeGreaterThan(0);
      expect(crate.version.length).toBeGreaterThan(0);
      expect(crate.maxStableVersion.length).toBeGreaterThan(0);
      expect(crate.newestVersion.length).toBeGreaterThan(0);
      expect(typeof crate.downloads).toBe("number");
      expect(typeof crate.recentDownloads).toBe("number");
      expect(typeof crate.numVersions).toBe("number");
      expect(crate.downloads).toBeGreaterThanOrEqual(0);
      expect(crate.recentDownloads).toBeGreaterThanOrEqual(0);
      expect(crate.numVersions).toBeGreaterThanOrEqual(1);
      expect(typeof crate.yanked).toBe("boolean");
      expect(typeof crate.exactMatch).toBe("boolean");
    }

    // Default list is sorted by all-time downloads, descending.
    for (let index = 1; index < crates.length; index++) {
      expect(crates[index - 1].downloads).toBeGreaterThanOrEqual(crates[index].downloads);
    }
  });

  /**
   * `getCrates` flags exact matches and normalizes query case/whitespace.
   *
   * @remarks
   * `serde` must carry `exactMatch: true` with populated description and
   * link fields; `"  SERDE "` must return and cache the same result order
   * as `"serde"`.
   */
  it("2. search maps exact matches and normalizes case and whitespace", async () => {
    const results = await api.getCrates("serde");
    const serde = must(
      results.find((crate) => crate.name === "serde"),
      "serde in live search results",
    );

    expect(serde.exactMatch).toBe(true);
    expect(serde.description).toBeTruthy();
    expect(serde.documentationURL).toBeTruthy();
    expect(serde.repositoryURL).toBeTruthy();

    const normalized = await api.getCrates("  SERDE ");
    expect(normalized.map((crate) => crate.name)).toEqual(results.map((crate) => crate.name));
    expect(api.getCachedCrates("  SERDE ")).toEqual(results);
  });

  /**
   * `getCrateDetails` returns categories/keywords and rejects unknown crates.
   *
   * @remarks
   * `serde` must yield at least one non-empty category or keyword; a
   * nonexistent id must reject with `crates.io request failed (404)`.
   */
  it("3. crate details live fetch and 404 contract", async () => {
    const details = await api.getCrateDetails("serde");

    expect(Array.isArray(details.categories)).toBe(true);
    expect(Array.isArray(details.keywords)).toBe(true);
    expect(details.categories.length + details.keywords.length).toBeGreaterThan(0);
    expect(details.categories.every((category) => category.length > 0)).toBe(true);
    expect(details.keywords.every((keyword) => keyword.length > 0)).toBe(true);

    await expect(api.getCrateDetails("no-such-crate-xyz-12345")).rejects.toThrow(
      /crates\.io request failed \(404\)/,
    );
  });

  /**
   * Aborts reject as `AbortError` and `toError` preserves `Error` identity.
   *
   * @remarks
   * Covers a pre-aborted `getCrates` signal, `toError` wrapping of plain
   * values versus passthrough of `Error` instances, and the details 404 path.
   */
  it("4. aborts and failures surface as real Errors", async () => {
    const controller = new AbortController();
    controller.abort();

    const abortError = await api.getCrates("tokio", controller.signal).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(abortError).toBeInstanceOf(Error);
    const abort = abortError as Error;
    expect(abort.name).toBe("AbortError");
    expect(abort.message).toMatch(/aborted/i);

    const normalized = api.toError("plain failure");
    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toBe("plain failure");
    const original = new Error("already an Error");
    expect(api.toError(original)).toBe(original);

    await expect(api.getCrateDetails("another-missing-crate-98765")).rejects.toThrow(
      /crates\.io request failed \(404\)/,
    );
  });

  /**
   * Repeat fetches are served from cache without network latency.
   *
   * @remarks
   * After a live `getCrates("tokio")`, the synchronous `getCachedCrates`
   * read must equal the result and a second `getCrates` must resolve in
   * under 100ms. Also covers the top-crates and details sync readers.
   */
  it("5. cache hits avoid the network and serve instant reads", async () => {
    const first = await api.getCrates("tokio");
    expect(api.getCachedCrates("tokio")).toEqual(first);

    const start = performance.now();
    const second = await api.getCrates("tokio");
    const elapsed = performance.now() - start;
    expect(second).toEqual(first);
    expect(elapsed).toBeLessThan(100);

    const top = await api.getTopCrates();
    expect(api.getCachedCrates("")).toEqual(top);

    const details = await api.getCrateDetails("serde");
    expect(api.getCachedCrateDetails("serde")).toEqual(details);
  });

  /**
   * Cache keys ignore case and surrounding whitespace.
   *
   * @remarks
   * `"  SERDE  "` and `"serDe"` must read the `"serde"` search entry,
   * blank queries must read the top-crates entry, and `"SERDE"` details
   * must resolve from cache in under 100ms.
   */
  it("6. cache keys normalize case, whitespace, and blank queries", async () => {
    const results = await api.getCrates("serde");
    expect(api.getCachedCrates("  SERDE  ")).toEqual(results);
    expect(api.getCachedCrates("serDe")).toEqual(results);

    const top = await api.getTopCrates();
    expect(api.getCachedCrates("   ")).toEqual(top);

    await api.getCrateDetails("serde");
    expect(api.getCachedCrateDetails("SERDE")).toBeDefined();

    const start = performance.now();
    const upper = await api.getCrateDetails("SERDE");
    expect(performance.now() - start).toBeLessThan(100);
    expect(upper).toEqual(await api.getCrateDetails("serde"));
  });

  /**
   * Expired and corrupt envelopes read as misses and are evicted from disk.
   *
   * @remarks
   * Seeds `search:serde` directly through a second `Cache` handle, then
   * re-imports `./api` so the module-level cache observes the entry.
   * Both the `not-json` payload and the past-`expiresAt` payload must
   * return `undefined` and leave no `search:serde` key on disk.
   */
  it("7. expired and corrupt cache envelopes are dropped", async () => {
    const writer = await openCache();

    // Seed the key, then re-import `./api` so it observes the entry.
    const valid = JSON.stringify({ expiresAt: Date.now() + 60_000, data: [] });
    writer.set("search:serde", valid);
    vi.resetModules();
    api = await import("./api");
    expect(api.getCachedCrates("serde")).toEqual([]);

    // Corrupt envelope: reads as a miss and is evicted from disk.
    writer.set("search:serde", "not-json{{{");
    expect(api.getCachedCrates("serde")).toBeUndefined();
    expect((await openCache()).has("search:serde")).toBe(false);

    // Expired envelope: same miss-and-evict contract against the real clock.
    writer.set("search:serde", valid);
    vi.resetModules();
    api = await import("./api");
    expect(api.getCachedCrates("serde")).toEqual([]);

    writer.set(
      "search:serde",
      JSON.stringify({ expiresAt: Date.now() - 1, data: [{ name: "stale" }] }),
    );
    expect(api.getCachedCrates("serde")).toBeUndefined();
    expect((await openCache()).has("search:serde")).toBe(false);
  });

  /**
   * Blank queries fall back to top crates; searches stay bounded and encoded.
   *
   * @remarks
   * `""` and `"   "` must equal `getTopCrates`; every search is capped at
   * 50 results; `"a/b?c&d e"` must match the name order of a manually
   * percent-encoded request to the same endpoint, and its cache key must
   * collapse repeated whitespace.
   */
  it("8. blank queries fall back to top crates; searches are bounded and URL-safe", async () => {
    const top = await api.getTopCrates();
    expect(await api.getCrates("")).toEqual(top);
    expect(await api.getCrates("   ")).toEqual(top);

    const results = await api.getCrates("serde");
    expect(results.length).toBeLessThanOrEqual(50);

    const encoded = await api.getCrates("a/b?c&d e");
    expect(Array.isArray(encoded)).toBe(true);
    expect(encoded.length).toBeLessThanOrEqual(50);
    // Distinct spacing normalizes to the same cache key.
    expect(api.getCachedCrates("a/b?c&d   e")).toEqual(encoded);

    // Request contract: api.ts must match a manually encoded live request.
    const oracleResponse = await fetch(
      "https://crates.io/api/v1/crates?page=1&per_page=50&q=a%2Fb%3Fc%26d%20e",
      { headers: { "User-Agent": "vicinae-crates-io-search/1.0 (+https://crates.io)" } },
    );
    expect(oracleResponse.ok).toBe(true);
    const oracle = (await oracleResponse.json()) as { crates: Array<{ name: string }> };
    expect(encoded.map((crate) => crate.name)).toEqual(oracle.crates.map((crate) => crate.name));
  });

  /**
   * `useCrateSymbols` parses docs.rs indexes and reports unbuilt versions.
   *
   * @remarks
   * `serde` must parse to non-empty entries with populated
   * category/name/full_name fields and `https://docs.rs/serde/` URLs,
   * including at least one of Structs, Functions, or Traits.
   * `tokio-util` must use the underscore lib target (`tokio_util`) in its
   * item URLs. A nonexistent version must settle with either a
   * `docs.rs request failed` error or `null` symbols, and only the
   * successful version may leave a `symbols:<id>@<version>` cache entry.
   */
  it("9. docs.rs symbols parse live, use hyphen targets, and miss cleanly", async () => {
    const serde = must(
      (await api.getCrates("serde")).find((crate) => crate.name === "serde"),
      "serde in live search results",
    );

    const serdeHook = await mountSymbolsHook({ ...serde, id: "serde" });
    expect(serdeHook.state[1]).toBe(true);
    const [symbols, loading, error] = await serdeHook.settled();
    await serdeHook.unmount();

    expect(loading).toBe(false);
    expect(error).toBeNull();
    const parsed = must(symbols, "parsed serde symbols");
    expect(parsed.length).toBeGreaterThan(0);
    for (const symbol of parsed) {
      expect(symbol.category.length).toBeGreaterThan(0);
      expect(symbol.name.length).toBeGreaterThan(0);
      expect(symbol.full_name.length).toBeGreaterThan(0);
      expect(symbol.docsrs_url.startsWith("https://docs.rs/serde/")).toBe(true);
    }
    const categories = new Set(parsed.map((symbol) => symbol.category));
    expect(
      [...categories].some((category) => ["Structs", "Functions", "Traits"].includes(category)),
    ).toBe(true);

    // Hyphenated crate ids map to underscore lib targets on docs.rs.
    const tokioUtil = must(
      (await api.getCrates("tokio-util")).find((crate) => crate.name === "tokio-util"),
      "tokio-util in live search results",
    );
    const hyphenHook = await mountSymbolsHook({ ...tokioUtil, id: "tokio-util" });
    const [hyphenSymbols, hyphenLoading, hyphenError] = await hyphenHook.settled();
    await hyphenHook.unmount();

    expect(hyphenLoading).toBe(false);
    expect(hyphenError).toBeNull();
    const hyphenParsed = must(hyphenSymbols, "parsed tokio-util symbols");
    expect(hyphenParsed.length).toBeGreaterThan(0);
    for (const symbol of hyphenParsed) {
      expect(symbol.docsrs_url.startsWith("https://docs.rs/tokio-util/")).toBe(true);
      expect(symbol.docsrs_url).toContain("/tokio_util/");
    }

    // A version docs.rs never built reports an error and caches nothing.
    const missingHook = await mountSymbolsHook({ ...serde, version: "0.0.0-does-not-exist" });
    const [missingSymbols, missingLoading, missingError] = await missingHook.settled();
    await missingHook.unmount();

    expect(missingLoading).toBe(false);
    if (missingError) {
      expect(missingError.message).toMatch(/docs\.rs request failed/);
    } else {
      expect(missingSymbols).toBeNull();
    }

    const reader = await openCache();
    expect(reader.has(`symbols:serde@${serde.version}`)).toBe(true);
    expect(reader.has("symbols:serde@0.0.0-does-not-exist")).toBe(false);
  });

  /**
   * Cache envelopes are portable and display helpers follow their contracts.
   *
   * @remarks
   * `search:serde` written by `./api` must be readable as an
   * `{ expiresAt, data }` envelope from a second `Cache` with a future
   * expiry. `dependencyLine` formats `name = "maxStableVersion"` (falling
   * back to `version`), matching the version the detail pane shows;
   * `crateAccessories` shows `maxStableVersion` (falling back to
   * `version`) and only tooltips when `newestVersion` differs;
   * `formatDate` returns `""` for invalid input and a localized date
   * otherwise; live link fields must be valid `https:` URLs.
   */
  it("10. namespace and display contracts hold with a second real Cache", async () => {
    const results = await api.getCrates("serde");
    const serde = must(
      results.find((crate) => crate.name === "serde"),
      "serde in live search results",
    );

    // Entries written by api.ts are readable from a second Cache instance.
    const reader = await openCache();
    const raw = must(reader.get("search:serde"), "search:serde cache entry");
    const envelope = JSON.parse(raw) as { expiresAt: number; data: unknown };
    expect(typeof envelope.expiresAt).toBe("number");
    expect(envelope.expiresAt).toBeGreaterThan(Date.now());
    expect(envelope.data).toEqual(results);

    const { crateAccessories, dependencyLine } = await import("./search-crates");
    expect(
      dependencyLine({
        ...serde,
        name: "my-crate",
        version: "2.0.0-beta.1",
        maxStableVersion: "1.2.3",
      }),
    ).toBe('my-crate = "1.2.3"');
    expect(
      dependencyLine({ ...serde, name: "my-crate", version: "1.2.3", maxStableVersion: "" }),
    ).toBe('my-crate = "1.2.3"');

    const live = crateAccessories(serde)[0];
    expect(live?.tag).toEqual({ value: `v${serde.maxStableVersion || serde.version}` });
    expect(live?.tooltip).toBe(
      serde.newestVersion === (serde.maxStableVersion || serde.version)
        ? undefined
        : `Newest version: v${serde.newestVersion}`,
    );

    const mismatch = crateAccessories({
      ...serde,
      maxStableVersion: "1.2.3",
      version: "1.2.3",
      newestVersion: "1.2.4-beta.1",
    })[0];
    expect(mismatch?.tag).toEqual({ value: "v1.2.3" });
    expect(mismatch?.tooltip).toBe("Newest version: v1.2.4-beta.1");

    const stable = crateAccessories({
      ...serde,
      maxStableVersion: "1.2.3",
      version: "1.2.3",
      newestVersion: "1.2.3",
    })[0];
    expect(stable?.tooltip).toBeUndefined();

    const fallback = crateAccessories({
      ...serde,
      maxStableVersion: "",
      version: "2.0.0",
      newestVersion: "2.0.0",
    })[0];
    expect(fallback?.tag).toEqual({ value: "v2.0.0" });
    expect(fallback?.tooltip).toBeUndefined();

    const { formatDate } = await import("./format");
    expect(formatDate("bad")).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("2024-01-15T12:00:00Z")).not.toBe("");

    const urls = [serde.documentationURL, serde.homepageURL, serde.repositoryURL].filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("https://")).toBe(true);
      expect(new URL(url).protocol).toBe("https:");
    }
  });

  /**
   * `getSymbolDetails` parses live docs.rs item pages and caches the result.
   *
   * @remarks
   * `serde::Deserialize` must yield the trait declaration, a non-empty
   * description, and populated sections (Required Methods, Implementations
   * on Foreign Types); the second read must come from the synchronous cache.
   */
  it("11. symbol details parse live docs.rs pages and cache", async () => {
    const serde = must(
      (await api.getCrates("serde")).find((crate) => crate.name === "serde"),
      "serde in live search results",
    );
    const url = `https://docs.rs/serde/${serde.version}/serde/trait.Deserialize.html`;

    const details = await api.getSymbolDetails(url);
    expect(details.declaration).toContain("pub trait Deserialize");
    expect(details.description).toBeTruthy();
    const titles = details.sections.map((section) => section.title);
    expect(titles).toContain("Required Methods");
    expect(titles).toContain("Implementations on Foreign Types");
    for (const section of details.sections) {
      expect(section.items.length).toBeGreaterThan(0);
      expect(section.items.every((item) => item.length > 0)).toBe(true);
    }

    expect(api.getCachedSymbolDetails(url)).toEqual(details);
    const start = performance.now();
    expect(await api.getSymbolDetails(url)).toEqual(details);
    expect(performance.now() - start).toBeLessThan(100);
  });

  /**
   * Trait pages carry their implementors in the static HTML.
   *
   * @remarks
   * The pinned `rand 0.9.2` `RngCore` page must list its required methods
   * and the in-crate implementors parsed from the `Implementors` section.
   */
  it("12. trait pages parse implementors from the static page", async () => {
    const url = "https://docs.rs/rand/0.9.2/rand/trait.RngCore.html";
    const details = await api.getSymbolDetails(url);

    expect(details.declaration).toContain("pub trait RngCore");
    const methods = must(
      details.sections.find((section) => section.title === "Required Methods"),
      "Required Methods section",
    );
    expect(methods.items).toContain("fn next_u32(&mut self) -> u32");

    const implementors = must(
      details.sections.find((section) => section.title === "Implementors"),
      "Implementors section",
    );
    expect(implementors.items).toContain("impl RngCore for StepRng");
    expect(implementors.items).toContain("impl RngCore for StdRng");
  });

  /**
   * Symbol detail misses pin the docs.rs 404 contract and cache nothing.
   *
   * @remarks
   * A bogus version must reject with `docs.rs request failed (404)`; a
   * pre-aborted signal must reject as `AbortError`. Neither may leave a
   * `symbol-details:` cache entry behind.
   */
  it("13. symbol detail misses reject and cache nothing", async () => {
    const url = "https://docs.rs/serde/0.0.0-does-not-exist/serde/trait.Deserialize.html";
    await expect(api.getSymbolDetails(url)).rejects.toThrow(/docs\.rs request failed \(404\)/);
    expect(api.getCachedSymbolDetails(url)).toBeUndefined();

    const controller = new AbortController();
    controller.abort();
    const abortError = await api.getSymbolDetails(url, controller.signal).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(abortError).toBeInstanceOf(Error);
    expect((abortError as Error).name).toBe("AbortError");
    expect(api.getCachedSymbolDetails(url)).toBeUndefined();
    expect((await openCache()).has(`symbol-details:${url}`)).toBe(false);
  });
});

/** Rendered-command and symbols contracts driven through the jsdom shim. */
describe("crates.io search live UI e2e", () => {
  /**
   * The first render browses popular crates and builds each row's panel.
   *
   * @remarks
   * Rows must match the live top-crates order, the preferred
   * `viewOnCratesIo` action must lead in its own untitled section, and the
   * remaining actions must group under Open/Copy/View. The detail pane
   * must carry the crate name and dependency snippet.
   */
  it("u1. first render lists popular crates with preference-first actions and details", async () => {
    const { default: Command } = await import("./search-crates");
    const ui = await render(<Command />);

    try {
      const firstRow = await waitFor(
        () => ui.mount.querySelector("list-item"),
        "first popular crate row",
      );
      const top = must(api.getCachedCrates(""), "top-crates cache after first render");
      expect(top.length).toBeGreaterThan(0);
      expect(firstRow.getAttribute("title")).toBe(top[0].name);
      expect(sectionTitles(ui.mount)).toEqual(["Popular Crates"]);
      expect(rowTitles(ui.mount)).toEqual(top.map((crate) => crate.name));

      const crate = top[0];
      const sections = Array.from(firstRow.querySelectorAll("action-panel-section"));
      expect(sections[0].getAttribute("title")).toBeNull();
      expect(actionTitles(sections[0])).toEqual(["View on crates.io"]);

      const groups = new Map(
        sections.slice(1).map((section) => [section.getAttribute("title"), actionTitles(section)]),
      );
      const expectedOpen = [
        crate.documentationURL && "Open Documentation",
        crate.homepageURL && "Open Homepage",
        crate.repositoryURL && "Open Repository",
      ].filter((title): title is string => Boolean(title));
      if (expectedOpen.length > 0) {
        expect(groups.get("Open")).toEqual(expectedOpen);
      } else {
        expect(groups.has("Open")).toBe(false);
      }
      expect(groups.get("Copy")).toEqual(["Copy Dependency Line", "Copy Crate Name"]);
      expect(groups.get("View")).toEqual(["View Symbols", "Hide Details"]);

      const detail = must(firstRow.querySelector("list-item-detail"), "detail pane");
      const markdown = must(detail.getAttribute("markdown"), "detail markdown");
      const version = crate.maxStableVersion || crate.version;
      expect(markdown).toContain(`# ${crate.name}`);
      expect(markdown).toContain(`${crate.name} = "${version}"`);
    } finally {
      await ui.unmount();
    }
  });

  /**
   * Typing debounces network traffic: one request, 300ms after the last key.
   *
   * @remarks
   * Intermediate keystrokes cancel each other; only `serde` reaches the
   * network, no partial query is cached, and the fired request must land at
   * least 290ms after the final keystroke (real timers, no clock fakes).
   */
  it("u2. search input debounces 300ms and fires once after the last keystroke", async () => {
    const { default: Command } = await import("./search-crates");
    const ui = await render(<Command />);
    const capture = captureRequests();

    try {
      await waitFor(() => api.getCachedCrates(""), "popular crates in cache");

      const keystrokes: number[] = [];
      for (const value of ["s", "se", "ser", "serd", "serde"]) {
        keystrokes.push(Date.now());
        await typeSearch(ui.mount, value);
        await tick(25);
      }

      const request = await waitFor(
        () => capture.requests.find((entry) => entry.url.includes("q=serde")),
        "debounced q=serde request",
      );
      expect(request.at - keystrokes[keystrokes.length - 1]).toBeGreaterThanOrEqual(290);
      expect(capture.requests.filter((entry) => entry.url.includes("/crates?page=1"))).toHaveLength(
        1,
      );
      expect(new URL(request.url).searchParams.get("q")).toBe("serde");

      for (const value of ["s", "se", "ser", "serd"]) {
        expect(api.getCachedCrates(value)).toBeUndefined();
      }
      await waitFor(() => {
        const results = api.getCachedCrates("serde");
        return results ? rowTitles(ui.mount)[0] === results[0].name : false;
      }, "serde rows after debounce");
    } finally {
      capture.stop();
      await ui.unmount();
    }
  });

  /**
   * Changing the query aborts the in-flight search; the latest query wins.
   *
   * @remarks
   * `serde` is observed on the wire, then superseded by a pre-warmed
   * `tokio` query. The serde request must be aborted (not surfaced as an
   * error), exactly one tokio request may fire, and the rows must settle on
   * the tokio results.
   */
  it("u3. superseding a query aborts the in-flight request and the latest query wins", async () => {
    const { default: Command } = await import("./search-crates");
    const ui = await render(<Command />);
    const capture = captureRequests();

    try {
      await waitFor(() => api.getCachedCrates(""), "popular crates in cache");
      const tokio = await api.getCrates("tokio");
      expect(tokio.length).toBeGreaterThan(0);

      const { act } = await import("react");
      await typeSearch(ui.mount, "serde");
      await act(async () => {
        await capture.nextRequest((url) => url.includes("q=serde"));
      });
      await typeSearch(ui.mount, "tokio");

      await act(async () => {
        await waitFor(
          () =>
            capture.failures.find(
              (failure) => failure.url.includes("q=serde") && failure.name === "AbortError",
            ),
          "aborted serde request",
        );
      });

      const names = tokio.map((crate) => crate.name);
      await waitFor(() => rowTitles(ui.mount).join(",") === names.join(","), "tokio rows");
      expect(capture.requests.filter((entry) => entry.url.includes("q=tokio"))).toHaveLength(1);
      expect(ui.mount.querySelector('empty-view[title="Failed to load crates"]')).toBeNull();
    } finally {
      capture.stop();
      await ui.unmount();
    }
  });

  /**
   * Typed queries split exact matches from other results; whitespace browses.
   *
   * @remarks
   * Live `serde` results must render under `Exact Match`/`Results` with the
   * cached grouping, then a whitespace-only query must return to the
   * `Popular Crates` list.
   */
  it("u4. typed queries split exact matches from the rest and whitespace returns to browsing", async () => {
    const { default: Command } = await import("./search-crates");
    const ui = await render(<Command />);

    try {
      await waitFor(() => api.getCachedCrates(""), "popular crates in cache");
      await typeSearch(ui.mount, "serde");
      const results = must(
        await waitFor(() => api.getCachedCrates("serde"), "serde results"),
        "serde results",
      );
      const exact = results.filter((crate) => crate.exactMatch).map((crate) => crate.name);
      const others = results.filter((crate) => !crate.exactMatch).map((crate) => crate.name);
      expect(exact).toContain("serde");
      expect(others.length).toBeGreaterThan(0);

      await waitFor(() => sectionTitles(ui.mount).includes("Exact Match"), "Exact Match section");
      const sections = sectionRows(ui.mount);
      expect(sections.get("Exact Match")).toEqual(exact);
      expect(sections.get("Results")).toEqual(others);
      expect(sections.has("Popular Crates")).toBe(false);

      const top = must(api.getCachedCrates(""), "top crates");
      await typeSearch(ui.mount, "   ");
      await waitFor(
        () => sectionTitles(ui.mount).join(",") === "Popular Crates",
        "popular crates restored",
      );
      expect(rowTitles(ui.mount)).toEqual(top.map((crate) => crate.name));
    } finally {
      await ui.unmount();
    }
  });

  /**
   * Selecting a row fetches and merges its categories/keywords into the pane.
   *
   * @remarks
   * The enriched tags must match the live `details:serde` cache entry, and
   * the crates.io metadata link must remain present.
   */
  it("u5. selecting a row enriches the detail pane with live tags", async () => {
    const { default: Command } = await import("./search-crates");
    const ui = await render(<Command />);

    try {
      await waitFor(() => api.getCachedCrates(""), "popular crates in cache");
      await typeSearch(ui.mount, "serde");
      const results = must(
        await waitFor(() => api.getCachedCrates("serde"), "serde results"),
        "serde results",
      );
      const serde = must(
        results.find((crate) => crate.name === "serde"),
        "serde result",
      );

      await selectRow(ui.mount, serde.id ?? serde.name);
      const details = must(
        await waitFor(() => api.getCachedCrateDetails(serde.name), "serde details"),
        "serde details",
      );
      expect(details.categories.length + details.keywords.length).toBeGreaterThan(0);

      await waitFor(() => tagLists(ui.mount).size > 0, "detail tag lists");
      const tags = tagLists(ui.mount);
      if (details.categories.length > 0) {
        expect(tags.get("Categories")).toEqual(details.categories);
      } else {
        expect(tags.has("Categories")).toBe(false);
      }
      if (details.keywords.length > 0) {
        expect(tags.get("Keywords")).toEqual(details.keywords);
      } else {
        expect(tags.has("Keywords")).toBe(false);
      }
      expect(
        must(
          ui.mount.querySelector('metadata-link[title="crates.io"]'),
          "crates.io link",
        ).getAttribute("text"),
      ).toBe("View crate");
    } finally {
      await ui.unmount();
    }
  });

  /**
   * Upstream failures surface a Retry empty view; a new query recovers.
   *
   * @remarks
   * A 9000-char query makes crates.io answer 414 deterministically. The
   * empty view must show the real error, Retry must re-issue the request,
   * and a fresh valid query must clear the error and load results.
   */
  it("u6. upstream errors render a retryable empty view and a new query recovers", async () => {
    const { default: Command } = await import("./search-crates");
    const ui = await render(<Command />);
    const capture = captureRequests();

    try {
      await waitFor(() => api.getCachedCrates(""), "popular crates in cache");
      const longQuery = "x".repeat(9000);
      await typeSearch(ui.mount, longQuery);

      const errorView = await waitFor(
        () => ui.mount.querySelector('empty-view[title="Failed to load crates"]'),
        "error empty view",
      );
      expect(errorView.getAttribute("description")).toMatch(/crates\.io request failed \(414\)/);
      expect(rowTitles(ui.mount)).toHaveLength(0);
      expect(api.getCachedCrates(longQuery)).toBeUndefined();

      const beforeRetry = capture.requests.filter((entry) => entry.url.includes("q=")).length;
      const retry = must(
        Array.from(ui.mount.querySelectorAll("empty-view action")).find(
          (action) => action.getAttribute("title") === "Retry",
        ),
        "Retry action",
      );
      const { act } = await import("react");
      await act(async () => {
        await (reactProps(retry).onAction as () => Promise<void>)();
      });
      await waitFor(
        () => capture.requests.filter((entry) => entry.url.includes("q=")).length > beforeRetry,
        "retried request",
      );
      await waitFor(
        () => ui.mount.querySelector('empty-view[title="Failed to load crates"]'),
        "error view after retry",
      );

      await typeSearch(ui.mount, "serde");
      const results = must(
        await waitFor(() => api.getCachedCrates("serde"), "serde results"),
        "serde results",
      );
      await waitFor(() => rowTitles(ui.mount)[0] === results[0].name, "recovered serde rows");
      expect(ui.mount.querySelector('empty-view[title="Failed to load crates"]')).toBeNull();
    } finally {
      capture.stop();
      await ui.unmount();
    }
  });

  /**
   * The symbols view groups by category, defaults to All, and filters.
   *
   * @remarks
   * Sections, dropdown items, row titles, and subtitles must match the live
   * `symbols:serde@<version>` cache entry; filtering keeps exactly one
   * category and selecting All restores every section.
   */
  it("u7. symbols group by category with an All-default dropdown and filtering", async () => {
    const serde = must(
      (await api.getCrates("serde")).find((crate) => crate.name === "serde"),
      "serde crate",
    );
    const { default: Symbols } = await import("./symbols");
    const ui = await render(<Symbols crate={{ ...serde, id: "serde" }} />);

    try {
      await waitFor(() => ui.mount.querySelector("list-item"), "first symbol row");
      const reader = await openCache();
      const raw = must(reader.get(`symbols:serde@${serde.version}`), "symbols cache entry");
      const symbols = (JSON.parse(raw) as { data: SymbolItem[] }).data;
      expect(symbols.length).toBeGreaterThan(0);
      const categories = [...new Set(symbols.map((symbol) => symbol.category))];

      const dropdown = must(ui.mount.querySelector("dropdown"), "category dropdown");
      expect(reactProps(dropdown).value).toBe("All");
      expect(
        Array.from(ui.mount.querySelectorAll("dropdown-item")).map((item) =>
          item.getAttribute("value"),
        ),
      ).toEqual(["All", ...categories]);

      const sections = sectionRows(ui.mount);
      expect([...sections.keys()]).toEqual(categories);
      for (const category of categories) {
        expect(sections.get(category)).toEqual(
          symbols.filter((symbol) => symbol.category === category).map((symbol) => symbol.name),
        );
      }

      const firstRow = must(ui.mount.querySelector("list-item"), "first symbol row");
      const firstSymbol = symbols[0];
      expect(firstRow.getAttribute("title")).toBe(firstSymbol.name);
      expect(firstRow.getAttribute("subtitle")).toBe(
        firstSymbol.full_name === firstSymbol.name ? null : firstSymbol.full_name,
      );

      await selectDropdown(ui.mount, categories[0]);
      expect(sectionTitles(ui.mount)).toEqual([categories[0]]);
      await selectDropdown(ui.mount, "All");
      expect(sectionTitles(ui.mount)).toEqual(categories);
    } finally {
      await ui.unmount();
    }
  });

  /**
   * Symbol misses pin the docs.rs 404 contract; unmount aborts in-flight work.
   *
   * @remarks
   * A live oracle request pins the bogus-version status, then the hook and
   * the rendered error view must report exactly `docs.rs request failed
   * (404)` and cache nothing. Unmounting a real in-flight symbols fetch
   * must abort it without writing a cache entry.
   */
  it("u8. symbols misses pin the 404 contract and unmount aborts in-flight fetches", async () => {
    const serde = must(
      (await api.getCrates("serde")).find((crate) => crate.name === "serde"),
      "serde crate",
    );
    const bogusVersion = "0.0.0-does-not-exist";

    // Pin the upstream contract before asserting the hook against it.
    const oracle = await fetch(`https://docs.rs/serde/${bogusVersion}/serde/all.html`, {
      headers: { "User-Agent": "vicinae-crates-io-search/1.0 (+https://crates.io)" },
    });
    expect(oracle.status).toBe(404);

    const missHook = await mountSymbolsHook({ ...serde, id: "serde", version: bogusVersion });
    const [missSymbols, missLoading, missError] = await missHook.settled();
    await missHook.unmount();
    expect(missLoading).toBe(false);
    expect(missError?.message).toBe("docs.rs request failed (404)");
    expect(missSymbols).toBeNull();
    expect((await openCache()).has(`symbols:serde@${bogusVersion}`)).toBe(false);

    // The rendered symbols view mirrors the hook error.
    const { default: Symbols } = await import("./symbols");
    const ui = await render(<Symbols crate={{ ...serde, id: "serde", version: bogusVersion }} />);
    try {
      const errorView = await waitFor(
        () => ui.mount.querySelector('empty-view[title="Couldn\'t load symbols"]'),
        "symbols error view",
      );
      expect(errorView.getAttribute("description")).toBe("docs.rs request failed (404)");
      expect(ui.mount.querySelectorAll("list-section")).toHaveLength(0);
      must(ui.mount.querySelector('empty-view action[title="Open in docs.rs"]'), "docs.rs action");
    } finally {
      await ui.unmount();
    }

    // Unmounting cancels the in-flight fetch without a cache write.
    const capture = captureRequests();
    const cancelHook = await mountSymbolsHook({ ...serde, id: "serde" });
    try {
      const started = await capture.nextRequest((url) =>
        url.includes(`docs.rs/serde/${serde.version}/serde/all.html`),
      );
      expect(started.url.startsWith("https://docs.rs/")).toBe(true);
      await cancelHook.unmount();
      await waitFor(
        () =>
          capture.failures.some(
            (failure) =>
              failure.url.includes(`docs.rs/serde/${serde.version}`) &&
              failure.name === "AbortError",
          ),
        "aborted docs.rs request",
      );
      await tick(250);
      expect((await openCache()).has(`symbols:serde@${serde.version}`)).toBe(false);
    } finally {
      capture.stop();
    }
  });

  /**
   * The detail pane strips `www.` hosts and passes invalid URLs through.
   *
   * @remarks
   * Live serde links must render real hosts; a crafted crate exercises
   * `hostOf`'s `www.`-stripping and invalid-URL branches plus tag-list and
   * metadata-link presence rules.
   */
  it("u9. detail pane strips www hosts, passes invalid urls through, and shows tags", async () => {
    const serde = must(
      (await api.getCrates("serde")).find((crate) => crate.name === "serde"),
      "serde crate",
    );
    const details = await api.getCrateDetails("serde");
    const { default: CrateDetail } = await import("./crate-detail");

    const live = await render(<CrateDetail crate={serde} details={details} />);
    try {
      const link = (title: string) =>
        must(live.mount.querySelector(`metadata-link[title="${title}"]`), `${title} link`);
      for (const [title, url] of [
        ["Documentation", serde.documentationURL],
        ["Repository", serde.repositoryURL],
        ["Homepage", serde.homepageURL],
      ] as const) {
        if (!url) continue;
        const element = link(title);
        expect(element.getAttribute("target")).toBe(url);
        expect(element.getAttribute("text")).toBe(new URL(url).host.replace(/^www\./, ""));
      }
      const crateLink = link("crates.io");
      expect(crateLink.getAttribute("target")).toBe(`https://crates.io/crates/${serde.name}`);
      expect(crateLink.getAttribute("text")).toBe("View crate");

      const tags = tagLists(live.mount);
      if (details.categories.length > 0) {
        expect(tags.get("Categories")).toEqual(details.categories);
      } else {
        expect(tags.has("Categories")).toBe(false);
      }
      if (details.keywords.length > 0) {
        expect(tags.get("Keywords")).toEqual(details.keywords);
      } else {
        expect(tags.has("Keywords")).toBe(false);
      }
    } finally {
      await live.unmount();
    }

    // Crafted link fields exercise hostOf's www-stripping and invalid passthrough.
    const crafted = {
      ...serde,
      documentationURL: "https://www.example.com/docs?q=1",
      homepageURL: "not a url",
      repositoryURL: undefined,
    };
    const craftedUi = await render(
      <CrateDetail crate={crafted} details={{ categories: [], keywords: [] }} />,
    );
    try {
      const links = Array.from(craftedUi.mount.querySelectorAll("metadata-link"));
      expect(links.map((element) => element.getAttribute("title"))).toEqual([
        "Documentation",
        "Homepage",
        "crates.io",
      ]);
      const docs = must(
        craftedUi.mount.querySelector('metadata-link[title="Documentation"]'),
        "crafted documentation link",
      );
      expect(docs.getAttribute("target")).toBe("https://www.example.com/docs?q=1");
      expect(docs.getAttribute("text")).toBe("example.com");
      const homepage = must(
        craftedUi.mount.querySelector('metadata-link[title="Homepage"]'),
        "crafted homepage link",
      );
      expect(homepage.getAttribute("text")).toBe("not a url");
      expect(craftedUi.mount.querySelectorAll("tag-list")).toHaveLength(0);
    } finally {
      await craftedUi.unmount();
    }
  });

  /**
   * The symbols view shows a default-on docs.rs detail pane for the selection.
   *
   * @remarks
   * Selecting a row must fetch its docs.rs page and render the declaration,
   * description, and sections (Variants, Implementations, Trait
   * Implementations) as markdown, with category metadata and a docs.rs
   * link. The View action must hide the pane and restore it from cache.
   */
  it("u10. symbols show a default-on docs.rs detail pane and toggle it", async () => {
    const serdeJson = must(
      (await api.getCrates("serde_json")).find((crate) => crate.name === "serde_json"),
      "serde_json crate",
    );
    const { default: Symbols } = await import("./symbols");
    const ui = await render(<Symbols crate={{ ...serdeJson, id: "serde_json" }} />);

    try {
      await waitFor(() => ui.mount.querySelector("list-item"), "first symbol row");
      const list = must(ui.mount.querySelector("list"), "symbols list");
      expect(reactProps(list).isShowingDetail).toBe(true);

      const reader = await openCache();
      const raw = must(
        reader.get(`symbols:serde_json@${serdeJson.version}`),
        "symbols cache entry",
      );
      const symbols = (JSON.parse(raw) as { data: SymbolItem[] }).data;
      const value = must(
        symbols.find((symbol) => symbol.name === "Value"),
        "Value symbol",
      );

      await selectRow(ui.mount, value.docsrs_url);
      const row = must(ui.mount.querySelector(`list-item[id="${value.docsrs_url}"]`), "Value row");
      const detail = must(row.querySelector("list-item-detail"), "Value detail pane");
      const markdown = await waitFor(() => {
        const current = detail.getAttribute("markdown");
        return current?.includes("pub enum Value") ? current : undefined;
      }, "parsed symbol details");

      expect(markdown).toContain("# Value");
      expect(markdown).toContain("## Variants");
      expect(markdown).toContain("- `Null`");
      expect(markdown).toContain("## Implementations");
      expect(markdown).toContain("## Trait Implementations");

      const category = must(
        row.querySelector('metadata-label[title="Category"]'),
        "category label",
      );
      expect(category.getAttribute("text")).toBe("Enums");
      const link = must(row.querySelector('metadata-link[title="docs.rs"]'), "docs.rs link");
      expect(link.getAttribute("target")).toBe(value.docsrs_url);

      // Default-on: the View section offers to hide the pane.
      const { act } = await import("react");
      const hide = must(
        Array.from(row.querySelectorAll("action")).find(
          (action) => action.getAttribute("title") === "Hide Details",
        ),
        "Hide Details action",
      );
      await act(async () => {
        (reactProps(hide).onAction as () => void)();
      });
      expect(reactProps(list).isShowingDetail).toBe(false);
      expect(ui.mount.querySelectorAll("list-item-detail")).toHaveLength(0);

      // Toggling back on restores the pane from the cache without a refetch.
      const show = must(
        Array.from(row.querySelectorAll("action")).find(
          (action) => action.getAttribute("title") === "Show Details",
        ),
        "Show Details action",
      );
      await act(async () => {
        (reactProps(show).onAction as () => void)();
      });
      expect(reactProps(list).isShowingDetail).toBe(true);
      const restored = must(
        must(
          ui.mount.querySelector(`list-item[id="${value.docsrs_url}"]`),
          "Value row",
        ).querySelector("list-item-detail"),
        "restored detail pane",
      );
      expect(restored.getAttribute("markdown")).toContain("pub enum Value");
    } finally {
      await ui.unmount();
    }
  });

  /**
   * The symbol detail pane renders declaration, description, and sections.
   *
   * @remarks
   * A crafted symbol pins the markdown contract: the full-name line only
   * when it differs from the name, a Rust fence for the declaration,
   * section bullets, and the loading/error status lines.
   */
  it("u11. symbol detail markdown follows its contract", async () => {
    const { default: SymbolDetail } = await import("./symbol-detail");
    const symbol: SymbolItem = {
      category: "Structs",
      name: "Error",
      full_name: "de::Error",
      docsrs_url: "https://docs.rs/demo/1.0.0/demo/de/struct.Error.html",
    };
    const details: SymbolDetails = {
      declaration: "pub struct Error { /* private fields */ }",
      description: "The error type.",
      sections: [
        { title: "Implementations", items: ["pub fn new() -> Self"] },
        { title: "Trait Implementations", items: ["impl Debug for Error"] },
      ],
    };

    const markdownOf = (mount: Element) =>
      must(mount.querySelector("list-item-detail")?.getAttribute("markdown"), "detail markdown");

    const loaded = await render(<SymbolDetail symbol={symbol} details={details} />);
    try {
      const markdown = markdownOf(loaded.mount);
      expect(markdown).toContain("# Error");
      expect(markdown).toContain("`de::Error`");
      expect(markdown).toContain("```rust\npub struct Error { /* private fields */ }\n```");
      expect(markdown).toContain("The error type.");
      expect(markdown).toContain("## Implementations\n\n- `pub fn new() -> Self`");
      expect(markdown).toContain("## Trait Implementations\n\n- `impl Debug for Error`");
      expect(markdown).not.toContain("Loading");
    } finally {
      await loaded.unmount();
    }

    const pending = await render(<SymbolDetail symbol={symbol} loading />);
    try {
      expect(markdownOf(pending.mount)).toContain("_Loading docs.rs details…_");
    } finally {
      await pending.unmount();
    }

    const failed = await render(
      <SymbolDetail symbol={symbol} error="docs.rs request failed (404)" />,
    );
    try {
      expect(markdownOf(failed.mount)).toContain(
        "_Couldn't load details: docs.rs request failed (404)_",
      );
    } finally {
      await failed.unmount();
    }

    // Top-level symbols skip the redundant full-name line.
    const topLevel = await render(
      <SymbolDetail symbol={{ ...symbol, full_name: "Error" }} details={details} />,
    );
    try {
      expect(markdownOf(topLevel.mount).startsWith("# Error\n\n```rust")).toBe(true);
    } finally {
      await topLevel.unmount();
    }
  });

  /**
   * A failed detail enrichment reports one reusable failure toast.
   *
   * @remarks
   * Selecting an id that is not a crate makes the single-crate endpoint
   * answer 404 deterministically. The row keeps its core fields, and the
   * failure reaches the host's toast channel instead of the detail pane.
   * A second failure updates the same toast id, so no two toasts are ever
   * shown at once.
   */
  it("u12. failed detail enrichment reports one reusable failure toast", async () => {
    const { default: Command } = await import("./search-crates");
    const ui = await render(<Command />);

    try {
      await waitFor(() => api.getCachedCrates(""), "popular crates in cache");
      await selectRow(ui.mount, "no-such-crate-xyz");

      const first = await waitFor(() => toasts[0], "failure toast");
      expect(first.title).toBe("Couldn't load crate details");
      expect(first.message).toMatch(/crates\.io request failed \(404\)/);
      expect(first.style).toBe("Error");
      expect(api.getCachedCrateDetails("no-such-crate-xyz")).toBeUndefined();

      await selectRow(ui.mount, "no-such-crate-abc");
      await waitFor(() => toasts.length > 1, "second failure toast");
      expect(toasts).toHaveLength(2);
      expect(toasts[1].id).toBe(first.id);
      expect(toasts[1].message).toMatch(/crates\.io request failed \(404\)/);
    } finally {
      await ui.unmount();
    }
  });
});

describe("primary action resolution", () => {
  /**
   * Enter keeps opening when the preferred action has no URL for the crate.
   *
   * @remarks
   * A crate without homepage, repository, or documentation URLs drops
   * those rows from the panel. The resolver must then promote the
   * always-available crates.io action instead of the first remaining
   * (copy) action, while a present preference still wins outright.
   */
  it("p1. missing preferred open actions fall back to the crates.io page", async () => {
    const { CrateActions, resolvePrimaryAction } = await import("./search-crates");
    const entry = (id: ActionEntry["id"], group: ActionEntry["group"]): ActionEntry => ({
      id,
      group,
      node: "action",
    });
    const copyLine = entry(CrateActions.COPY_TO_CLIPBOARD, "copy");
    const cratesIo = entry(CrateActions.VIEW_ON_CRATES_IO, "open");
    const homepage = entry(CrateActions.OPEN_HOMEPAGE, "open");

    // The preferred action wins when the crate provides it.
    expect(
      resolvePrimaryAction([copyLine, cratesIo, homepage], CrateActions.OPEN_HOMEPAGE)?.id,
    ).toBe(CrateActions.OPEN_HOMEPAGE);

    // Without a homepage URL the row falls back to opening, not copying.
    expect(resolvePrimaryAction([copyLine, cratesIo], CrateActions.OPEN_HOMEPAGE)?.id).toBe(
      CrateActions.VIEW_ON_CRATES_IO,
    );

    // A preferred copy action still wins when present.
    expect(resolvePrimaryAction([copyLine, cratesIo], CrateActions.COPY_TO_CLIPBOARD)?.id).toBe(
      CrateActions.COPY_TO_CLIPBOARD,
    );
  });
});
