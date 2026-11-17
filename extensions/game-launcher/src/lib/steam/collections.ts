/**
 * Steam library collections (Favorites, Hidden, user collections), read from
 * the client's local copy of its cloud storage:
 *
 *   userdata/<account>/config/cloudstorage/cloud-storage-namespace-1.json
 *
 * The file is a JSON array of [key, entry] pairs. Collection entries have keys
 * "user-collections.<id>" and a JSON-encoded `value`:
 *   { id, name, added: number[], removed: number[], filterSpec? }
 *
 * Collections whose filterSpec has rules are "dynamic" (Steam evaluates the
 * rules against store data); we don't re-implement those and skip them.
 * Partner collections (e.g. EA Play) have no members and are skipped too.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SteamCollection {
  /** Steam's collection id: "favorite", "hidden", or "uc-…" for user collections. */
  id: string;
  name: string;
  appids: Set<number>;
}

export interface SteamCollections {
  favorites?: SteamCollection;
  hidden: Set<number>;
  /** Static user collections, sorted by name. */
  user: SteamCollection[];
  /** Number of dynamic (rule-based) collections that were skipped. */
  dynamicSkipped: number;
  /**
   * False if a collections file existed but couldn't be read or parsed (e.g. Steam was mid-write).
   * The hidden set is then incomplete and must not be used to forget "shown here" overrides.
   */
  ok: boolean;
}

interface CollectionValue {
  id?: string;
  name?: string;
  added?: unknown[];
  removed?: unknown[];
  filterSpec?: { filterGroups?: { rgOptions?: unknown[] }[]; strSearchText?: string };
}

function isDynamic(value: CollectionValue): boolean {
  const spec = value.filterSpec;
  if (!spec) return false;
  return Boolean(spec.strSearchText) || (spec.filterGroups ?? []).some((g) => (g.rgOptions?.length ?? 0) > 0);
}

function members(value: CollectionValue): Set<number> {
  const removed = new Set((value.removed ?? []).filter((x): x is number => typeof x === "number"));
  return new Set((value.added ?? []).filter((x): x is number => typeof x === "number" && !removed.has(x)));
}

/** Parse one cloud-storage-namespace-1.json document. Unknown or malformed entries are ignored. */
export function parseCollections(json: string): SteamCollections {
  const result: SteamCollections = { hidden: new Set(), user: [], dynamicSkipped: 0, ok: true };
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return { ...result, ok: false };
  }
  if (!Array.isArray(doc)) return { ...result, ok: false };

  for (const pair of doc) {
    if (!Array.isArray(pair) || typeof pair[0] !== "string" || !pair[0].startsWith("user-collections.")) continue;
    const entry = pair[1] as { is_deleted?: boolean; value?: string } | undefined;
    if (!entry || entry.is_deleted || typeof entry.value !== "string") continue;
    let value: CollectionValue;
    try {
      value = JSON.parse(entry.value) as CollectionValue;
    } catch {
      continue;
    }
    const id = value.id ?? pair[0].slice("user-collections.".length);
    if (id === "hidden") {
      for (const appid of members(value)) result.hidden.add(appid);
    } else if (id === "favorite") {
      result.favorites = { id, name: value.name || "Favorites", appids: members(value) };
    } else if (id.startsWith("uc-")) {
      if (isDynamic(value)) result.dynamicSkipped++;
      else result.user.push({ id, name: value.name || "Untitled collection", appids: members(value) });
    }
  }
  result.user.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  return result;
}

function merge(a: SteamCollection | undefined, b: SteamCollection): SteamCollection {
  if (!a) return { ...b, appids: new Set(b.appids) };
  return { ...a, appids: new Set([...a.appids, ...b.appids]) };
}

/** Collections for every Steam account on this machine, merged (union of members per collection id). */
export function readSteamCollections(userDataDirs: readonly string[]): SteamCollections {
  const merged: SteamCollections = { hidden: new Set(), user: [], dynamicSkipped: 0, ok: true };
  const user = new Map<string, SteamCollection>();
  for (const dir of userDataDirs) {
    const cloudDir = join(dir, "config/cloudstorage");
    let files: string[];
    try {
      files = readdirSync(cloudDir).filter((f) => f === "cloud-storage-namespace-1.json");
    } catch {
      continue;
    }
    for (const f of files) {
      let text: string;
      try {
        text = readFileSync(join(cloudDir, f), "utf8");
      } catch {
        merged.ok = false;
        continue;
      }
      const parsed = parseCollections(text);
      merged.ok &&= parsed.ok;
      for (const id of parsed.hidden) merged.hidden.add(id);
      if (parsed.favorites) merged.favorites = merge(merged.favorites, parsed.favorites);
      for (const c of parsed.user) user.set(c.id, merge(user.get(c.id), c));
      merged.dynamicSkipped += parsed.dynamicSkipped;
    }
  }
  merged.user = [...user.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  return merged;
}
