import type { FlatpakScope, SoftwareItem } from "../types.ts";
import { C_LOCALE_ENV, runProcess } from "../utils/process.ts";
import { FlatpakOperationError, scopeFlag } from "./flatpak-common.ts";
import {
  dedupeFlatpakSearchRecords,
  flatpakInstallKey,
  parseFlatpakSearchOutput,
  selectFlatpakRemote,
  type FlatpakSearchRecord,
  type InstalledFlatpak,
} from "./flatpak-parsing.ts";

const CANDIDATE_LINE_LIMIT = 400;
const SEARCH_TIMEOUT_MS = 20_000;
/** Safety cap only; relevance ranking happens in rankSoftwareResults. */
const RESULT_CAP = 200;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 12;

interface FlatpakScopeSearch {
  records: FlatpakSearchRecord[];
  warning?: string;
  /** False when a scope failed or output was cut off; never cached. */
  complete: boolean;
}

/** Searches each scope independently; throws only when every scope fails. */
export async function searchFlatpakScopes(
  executable: string,
  query: string,
  scopes: readonly FlatpakScope[],
  signal?: AbortSignal,
): Promise<FlatpakScopeSearch> {
  const searches = await Promise.allSettled(scopes.map(async (scope) => {
    const result = await runProcess(
      executable,
      [
        "search",
        scopeFlag(scope),
        "--columns=name,description,application,version,branch,remotes",
        "--",
        query,
      ],
      {
        signal,
        env: C_LOCALE_ENV,
        maxLines: CANDIDATE_LINE_LIMIT,
        maxOutputBytes: 1024 * 1024,
        timeoutMs: SEARCH_TIMEOUT_MS,
      },
    );
    // runProcess drops any partial final line when it stops at a limit.
    return {
      records: parseFlatpakSearchOutput(result.stdout, scope),
      truncated: result.truncated,
    };
  }));

  signal?.throwIfAborted();
  const failedScopes = scopes.filter((_, index) =>
    searches[index]?.status === "rejected"
  );
  if (failedScopes.length === scopes.length) {
    const failure = searches.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw failure?.reason ?? new FlatpakOperationError("failed", "Flatpak search failed");
  }

  const successful = searches.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  return {
    records: successful.flatMap((result) => result.records),
    warning: failedScopes.length > 0
      ? `Flatpak ${failedScopes.join(" and ")} search failed; showing partial results`
      : undefined,
    complete: failedScopes.length === 0 &&
      successful.every((result) => !result.truncated),
  };
}

export function flatpakSearchItems(
  records: readonly FlatpakSearchRecord[],
  installed: readonly InstalledFlatpak[],
  preferredScope: FlatpakScope,
  limit = RESULT_CAP,
): SoftwareItem[] {
  const installedKeys = new Set(
    installed.map((app) => flatpakInstallKey(app.scope, app.id)),
  );
  return dedupeFlatpakSearchRecords(records, preferredScope, installedKeys, limit)
    .flatMap((record) => {
      const remote = selectFlatpakRemote(record.remotes);
      if (!remote) return [];
      return [{
        id: record.id,
        name: record.name,
        description: record.description,
        source: "flatpak",
        installed: installedKeys.has(flatpakInstallKey(record.scope, record.id)),
        version: record.version,
        flatpak: { remote, scope: record.scope, branch: record.branch },
      } satisfies SoftwareItem];
    });
}

/** Small per-backend LRU so retyping a recent query avoids a remote scan. */
export class FlatpakSearchCache {
  private readonly entries = new Map<
    string,
    { createdAt: number; records: FlatpakSearchRecord[] }
  >();

  get(query: string): FlatpakSearchRecord[] | undefined {
    const key = query.toLowerCase();
    const cached = this.entries.get(key);
    if (!cached) return undefined;
    this.entries.delete(key);
    if (Date.now() - cached.createdAt > CACHE_TTL_MS) return undefined;
    this.entries.set(key, cached);
    return cached.records;
  }

  set(query: string, records: FlatpakSearchRecord[]): void {
    this.entries.set(query.toLowerCase(), { createdAt: Date.now(), records });
    while (this.entries.size > CACHE_LIMIT) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
