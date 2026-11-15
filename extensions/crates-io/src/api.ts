/**
 * crates.io search, crate details, and docs.rs symbol scraping, with TTL caching.
 *
 * `Cache` has no TTL option that is portable across both hosts (Raycast's
 * has none), so values are stored as `{ expiresAt, data }` envelopes and
 * validated on read. Each fetcher pairs with a synchronous `getCached*` read
 * so the UI can render instantly on hits.
 */
import { parse, type HTMLElement } from "node-html-parser";
import { useEffect, useState } from "react";
import { Cache } from "@raycast/api";

const cache = new Cache({ namespace: "crates-v2" });

const API_BASE = "https://crates.io/api/v1";
const USER_AGENT = "vicinae-crates-io-search/1.0 (+https://crates.io)";
const REQUEST_TIMEOUT = 10_000;
const PAGE_SIZE = 50;

const TOP_CRATES_TTL = 24 * 60 * 60 * 1000; // 24h: default list changes slowly
const SEARCH_TTL = 10 * 60 * 1000; // 10m: queries stay fresh
const SYMBOLS_TTL = 7 * 24 * 60 * 60 * 1000; // 7d: symbols are pinned to a version
const DETAILS_TTL = 24 * 60 * 60 * 1000; // 24h: categories/keywords barely change

/** Cache envelope with an absolute expiry timestamp. */
interface Entry<T> {
  expiresAt: number;
  data: T;
}

/** Read `key`; `undefined` on miss, expiry, or corrupt JSON (entry is dropped). */
function cacheGet<T>(key: string): T | undefined {
  const raw = cache.get(key);
  if (!raw) return undefined;
  try {
    const entry = JSON.parse(raw) as Entry<T>;
    if (Date.now() > entry.expiresAt) {
      cache.remove(key);
      return undefined;
    }
    return entry.data;
  } catch {
    cache.remove(key);
    return undefined;
  }
}

/** Write `data` under `key`, expiring `ttl` ms from now. */
function cacheSet<T>(key: string, data: T, ttl: number): void {
  const entry: Entry<T> = { expiresAt: Date.now() + ttl, data };
  cache.set(key, JSON.stringify(entry));
}

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Combine an optional caller `signal` with the request timeout. */
function timeoutSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** A crates.io crate, normalized from the search/list endpoint. */
export interface Crate {
  /** Crate id (falls back to `name` when absent). */
  id?: string;
  name: string;
  /** Latest version, including pre-releases. */
  version: string;
  /** Latest stable version (falls back to `version`). */
  maxStableVersion: string;
  /** Newest published version, stable or not. */
  newestVersion: string;
  downloads: number;
  /** Downloads over the last 90 days. */
  recentDownloads: number;
  createdAt?: string;
  updatedAt?: string;
  numVersions: number;
  yanked: boolean;
  /** crates.io reported this crate as an exact match for the query. */
  exactMatch: boolean;
  documentationURL?: string;
  homepageURL?: string;
  repositoryURL?: string;
  description?: string;
}

/** Extra crate fields only returned by the single-crate endpoint. */
export interface CrateDetails {
  categories: string[];
  keywords: string[];
}

/** One docs.rs index entry, with a direct link to its item page. */
export type SymbolItem = {
  category: string;
  name: string;
  full_name: string;
  docsrs_url: string;
};

type Symbols = SymbolItem[];

/** One section of a docs.rs item page (e.g. "Trait Implementations"). */
export interface SymbolSection {
  title: string;
  items: string[];
}

/** docs.rs details for one symbol, scraped from its item page. */
export interface SymbolDetails {
  declaration?: string;
  description?: string;
  sections: SymbolSection[];
}

interface CratesApiResponse {
  crates: Array<{
    id: string;
    name: string;
    max_version: string;
    max_stable_version?: string;
    newest_version?: string;
    downloads: number;
    recent_downloads?: number;
    created_at?: string;
    updated_at?: string;
    num_versions?: number;
    yanked?: boolean;
    exact_match?: boolean;
    documentation?: string;
    homepage?: string;
    repository?: string;
    description?: string;
  }>;
}

/** GET a crates.io endpoint; throws on non-2xx or timeout. */
async function fetchJson(url: string, signal?: AbortSignal): Promise<CratesApiResponse> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: timeoutSignal(signal),
  });
  if (!response.ok) {
    throw new Error(`crates.io request failed (${response.status})`);
  }
  return (await response.json()) as CratesApiResponse;
}

function toCrate(raw: CratesApiResponse["crates"][number]): Crate {
  return {
    id: raw.id,
    name: raw.name,
    version: raw.max_version,
    maxStableVersion: raw.max_stable_version ?? raw.max_version,
    newestVersion: raw.newest_version ?? raw.max_version,
    downloads: raw.downloads,
    recentDownloads: raw.recent_downloads ?? 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    numVersions: raw.num_versions ?? 0,
    yanked: raw.yanked ?? false,
    exactMatch: raw.exact_match ?? false,
    documentationURL: raw.documentation,
    homepageURL: raw.homepage,
    repositoryURL: raw.repository,
    description: raw.description,
  };
}

function searchKey(query: string): string {
  return query === "" ? "top-crates" : `search:${query.replace(/\s+/g, " ").toLowerCase()}`;
}

export function getCachedCrates(search: string): Crate[] | undefined {
  return cacheGet<Crate[]>(searchKey(search.trim()));
}

export async function getTopCrates(signal?: AbortSignal): Promise<Crate[]> {
  const cached = getCachedCrates("");
  if (cached) {
    return cached;
  }
  const json = await fetchJson(`${API_BASE}/crates?sort=downloads&per_page=${PAGE_SIZE}`, signal);
  const crates = json.crates.map(toCrate);
  cacheSet("top-crates", crates, TOP_CRATES_TTL);
  return crates;
}

export async function getCrates(search: string, signal?: AbortSignal): Promise<Crate[]> {
  const query = search.trim();
  if (query === "") {
    return getTopCrates(signal);
  }
  const key = searchKey(query);
  const cached = cacheGet<Crate[]>(key);
  if (cached) {
    return cached;
  }
  const json = await fetchJson(
    `${API_BASE}/crates?page=1&per_page=${PAGE_SIZE}&q=${encodeURIComponent(query)}`,
    signal,
  );
  const crates = json.crates.map(toCrate);
  cacheSet(key, crates, SEARCH_TTL);
  return crates;
}

interface CrateDetailApiResponse {
  crate: {
    categories?: string[];
    keywords?: string[];
  };
}

export function getCachedCrateDetails(name: string): CrateDetails | undefined {
  return cacheGet<CrateDetails>(`details:${name.toLowerCase()}`);
}

export async function getCrateDetails(name: string, signal?: AbortSignal): Promise<CrateDetails> {
  const key = `details:${name.toLowerCase()}`;
  const cached = cacheGet<CrateDetails>(key);
  if (cached) {
    return cached;
  }

  const response = await fetch(`${API_BASE}/crates/${encodeURIComponent(name)}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: timeoutSignal(signal),
  });
  if (!response.ok) {
    throw new Error(`crates.io request failed (${response.status})`);
  }

  const json = (await response.json()) as CrateDetailApiResponse;
  const details: CrateDetails = {
    categories: json.crate.categories ?? [],
    keywords: json.crate.keywords ?? [],
  };
  cacheSet(key, details, DETAILS_TTL);
  return details;
}

/** Crate id to lib target for docs.rs URLs (`my-crate` → `my_crate`). */
const snakeCase = (id: string) => (id.includes("-") ? id.replace(/-/g, "_") : id);

/**
 * Load symbols for `crate` from its docs.rs `all.html` index (7d cache).
 *
 * @returns `[symbols, loading, error]`; `symbols` is `null` until loaded
 * or when the index page has no parseable content.
 */
export function useCrateSymbols(crate: Crate): [Symbols | null, boolean, Error | null] {
  const [symbols, setSymbols] = useState<Symbols | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const id = crate.id ?? crate.name;
    const version = crate.version;
    const cacheKey = `symbols:${id}@${version}`;

    const cached = cacheGet<Symbols>(cacheKey);
    if (cached) {
      setSymbols(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function fetchSymbols() {
      try {
        const target = snakeCase(id);
        const url = `https://docs.rs/${id}/${version}/${target}/all.html`;
        const response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: timeoutSignal(controller.signal),
        });
        if (!response.ok) {
          throw new Error(`docs.rs request failed (${response.status})`);
        }

        const root = parse(await response.text());
        const mainContent = root.querySelector("#main-content") ?? root.querySelector("#main");
        if (mainContent === null) {
          if (!cancelled) setSymbols(null);
          return;
        }

        const symbolsResult: Symbols = [];
        for (const category of mainContent.querySelectorAll("h3")) {
          const categoryName = category.rawText.trim();
          const items = category.nextElementSibling?.querySelectorAll("li > a");
          if (!items) continue;
          items.forEach((item) => {
            const fullName = item.rawText;
            const href = item.getAttribute("href") ?? "";
            symbolsResult.push({
              category: categoryName,
              name: fullName.split("::").pop() || fullName,
              full_name: fullName,
              docsrs_url: `https://docs.rs/${id}/${version}/${target}/${href}`,
            });
          });
        }

        if (!cancelled) setSymbols(symbolsResult);
        // Don't cache empty results: they usually mean the page shape changed.
        if (symbolsResult.length > 0) {
          cacheSet(cacheKey, symbolsResult, SYMBOLS_TTL);
        }
      } catch (e) {
        if (!cancelled) setError(toError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchSymbols();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [crate]);

  return [symbols, loading, error];
}

/** Collapse whitespace and decode entities in `node`'s text; empty is `undefined`. */
function nodeText(node: HTMLElement | null): string | undefined {
  const text = node?.structuredText.replace(/\s+/g, " ").trim();
  return text ? text : undefined;
}

/** `text` cut at a word boundary with an ellipsis once past `limit` characters. */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf(" ", limit);
  return `${text.slice(0, cut > 0 ? cut : limit)}…`;
}

/** Text of every `selector` match under `node`, in document order. */
function collectText(node: HTMLElement, selector: string): string[] {
  const texts: string[] = [];
  for (const element of node.querySelectorAll(selector)) {
    const text = nodeText(element);
    if (text) texts.push(text);
  }
  return texts;
}

/** Items listed under one `h2.section-header`, keyed by the section id. */
function sectionItems(heading: HTMLElement): string[] {
  const h3: string[] = [];
  const h4: string[] = [];
  const fields: string[] = [];
  const paragraphs: string[] = [];

  for (
    let node = heading.nextElementSibling;
    node && node.tagName !== "H2";
    node = node.nextElementSibling
  ) {
    h3.push(...collectText(node, "h3.code-header"));
    h4.push(...collectText(node, "h4.code-header"));
    fields.push(...collectText(node, "span.structfield > code"));
    if (node.tagName === "SPAN" && node.classList.contains("structfield")) {
      const text = nodeText(node.querySelector("code"));
      if (text) fields.push(text);
    }
    paragraphs.push(...collectText(node, "div.dyn-compatibility-info p"));
  }

  switch (heading.getAttribute("id")) {
    case "implementations":
      // Inherent impls: method signatures beat the bare `impl` header.
      return h4.length > 0 ? h4 : h3;
    case "fields":
      return fields;
    case "dyn-compatibility":
      return paragraphs.slice(0, 1);
    default:
      // Trait impls, variants, required/provided items: headers are the item.
      return h3.length > 0 ? h3 : h4;
  }
}

function parseSymbolPage(html: string): SymbolDetails {
  const root = parse(html);
  const main = root.querySelector("#main-content") ?? root.querySelector("#main");
  if (!main) return { sections: [] };

  // `pre` content parses as raw text, so re-parse it to drop the markup.
  const declarationNode = main.querySelector("pre.item-decl");
  const declaration = declarationNode ? nodeText(parse(declarationNode.rawText)) : undefined;

  const topDoc =
    main.querySelector("details.top-doc div.docblock") ?? main.querySelector("div.docblock");
  const paragraph = nodeText(topDoc?.querySelector("p") ?? null);
  const fallback = topDoc ? nodeText(topDoc) : undefined;
  const description = paragraph ?? (fallback ? truncate(fallback, 400) : undefined);

  const sections: SymbolSection[] = [];
  for (const heading of main.querySelectorAll("h2.section-header")) {
    const title = (nodeText(heading) ?? "").replace(/§$/, "").trim();
    const items = sectionItems(heading);
    if (items.length > 0) sections.push({ title, items });
  }

  return { declaration, description, sections };
}

export function getCachedSymbolDetails(url: string): SymbolDetails | undefined {
  return cacheGet<SymbolDetails>(`symbol-details:${url}`);
}

export async function getSymbolDetails(url: string, signal?: AbortSignal): Promise<SymbolDetails> {
  const key = `symbol-details:${url}`;
  const cached = cacheGet<SymbolDetails>(key);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: timeoutSignal(signal),
  });
  if (!response.ok) throw new Error(`docs.rs request failed (${response.status})`);

  const details = parseSymbolPage(await response.text());
  // Don't cache empty results: they usually mean the page shape changed.
  if (details.declaration || details.description || details.sections.length > 0) {
    cacheSet(key, details, SYMBOLS_TTL);
  }
  return details;
}
