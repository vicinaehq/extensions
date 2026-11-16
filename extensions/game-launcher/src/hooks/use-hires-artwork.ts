import { useCallback, useEffect, useMemo, useState } from "react";
import { type ArtworkRequest, artKeyOf, type CachedKind, forEachLimit, isUrlRequest } from "../lib/artwork-cache";
import { type ArtworkSource, openArtworkCache } from "../lib/artwork-location";
import { artKeyFor, neededKinds, requestFor } from "../lib/artwork-requests";
import type { Game, GameArtwork } from "../lib/games";
import type { LibraryScan } from "../lib/library";
import type { ViewSettings } from "../lib/view-settings";

const CONCURRENCY = 6;
const FLUSH_MS = 150;

/**
 * Downloaded artwork, keyed by art key: "steam:<appid>" or a Heroic game id (see artKeyFor), so it's
 * stable whichever launcher's copy an entry is shown as.
 */
export type HiresArtMap = ReadonlyMap<string, GameArtwork>;

/** The downloaded artwork for a (possibly merged) game, if it has a copy with downloadable art. */
export function hiresFor(game: Game, art: HiresArtMap): GameArtwork | undefined {
  const key = artKeyFor(game);
  return key ? art.get(key) : undefined;
}

function setArt(map: Map<string, GameArtwork>, key: string, kind: CachedKind, path: string) {
  map.set(key, { ...map.get(key), [kind]: path });
}

function requestKey(r: ArtworkRequest): string {
  if (isUrlRequest(r)) return [r.runner, r.appName, r.kind, r.url].join("|");
  return [r.appid, r.kind, r.hasLocal ? 1 : 0, r.clientIcon ?? "", r.localIco ?? ""].join("|");
}

export interface HiresArtwork {
  art: HiresArtMap;
  /** Files and bytes currently cached. */
  usage: () => { files: number; bytes: number };
  /** Delete the whole cache. With downloads enabled, current art is re-fetched afterwards. */
  clearCache: () => { files: number; bytes: number };
}

/**
 * High-resolution artwork for the scanned games. Returns what's already cached immediately, then
 * downloads anything missing in the background and re-renders as files arrive. Also prunes art for
 * uninstalled games once per complete scan.
 *
 * Everything here is keyed on the art keys and the kinds of art the layout needs, not on the merged
 * entries, so re-merging (e.g. a Launcher Priority change) doesn't re-prune or restart downloads.
 */
export function useHiresArtwork(scan: LibraryScan | undefined, settings: ViewSettings, source: ArtworkSource): HiresArtwork {
  const kinds = neededKinds(settings);
  const cache = useMemo(() => openArtworkCache(source), [source]);
  // Bumped after clearing the cache, to re-read it and restart downloads.
  const [generation, setGeneration] = useState(0);

  // Prune before reading so the first render never points at files about to be deleted. These come
  // straight from the raw scan, so they only change when the disk is rescanned, not on a re-merge.
  const installedSteamAppids = scan?.installedSteamAppids;
  const steamComplete = scan?.steamComplete ?? false;
  const installedHeroicGames = scan?.installedHeroicGames;
  useMemo(() => {
    // Only for launchers enabled and fully scanned: otherwise "not installed" can't be told from "not scanned".
    if (steamComplete && installedSteamAppids) cache.prune(installedSteamAppids);
    if (installedHeroicGames) cache.pruneHeroic(installedHeroicGames);
  }, [installedSteamAppids, steamComplete, installedHeroicGames, cache]);

  // The cache requests for what's on screen, de-duplicated, plus a key that only changes when they do.
  const allRequests: ArtworkRequest[] = [];
  for (const game of scan?.games ?? []) {
    for (const kind of kinds) {
      const req = requestFor(game, kind);
      if (req) allRequests.push(req);
    }
  }
  const requestsKey = [...new Set(allRequests.map(requestKey))].sort().join("\n");
  // Deliberately keyed on requestsKey only: allRequests is rebuilt every render, requestsKey captures its content.
  const requests = useMemo(() => [...new Map(allRequests.map((r) => [requestKey(r), r])).values()], [requestsKey]);

  // Whatever is already on disk, so the first render is sharp when the cache is warm.
  const initial = useMemo(() => {
    const map = new Map<string, GameArtwork>();
    for (const req of requests) {
      // In local-only mode, only use icons extracted from Steam's own local .ico files.
      if (source === "local" && !(!isUrlRequest(req) && req.kind === "icon" && req.localIco)) continue;
      const path = cache.get(req);
      if (path) setArt(map, artKeyOf(req), req.kind, path);
    }
    return map;
  }, [requests, cache, source, generation]);

  const [art, setArtState] = useState(initial);
  useEffect(() => setArtState(initial), [initial]);

  useEffect(() => {
    const jobs = requests.filter((req) => cache.needsFetch(req));
    if (jobs.length === 0) return;

    let cancelled = false;
    let pending: { key: string; kind: CachedKind; path: string }[] = [];
    const flush = () => {
      if (cancelled || pending.length === 0) return;
      const batch = pending;
      pending = [];
      setArtState((prev) => {
        const next = new Map(prev);
        for (const p of batch) setArt(next, p.key, p.kind, p.path);
        return next;
      });
    };
    const timer = setInterval(flush, FLUSH_MS);

    forEachLimit(jobs, CONCURRENCY, async (req) => {
      if (cancelled) return;
      const path = await cache.ensure(req);
      if (path) pending.push({ key: artKeyOf(req), kind: req.kind, path });
    })
      .catch((err) => console.warn("Artwork download failed", err))
      .finally(() => {
        flush();
        clearInterval(timer);
      });

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [requests, cache, generation]);

  const clearCache = useCallback(() => {
    const freed = cache.clear();
    setArtState(new Map());
    setGeneration((g) => g + 1);
    return freed;
  }, [cache]);

  const usage = useCallback(() => cache.usage(), [cache]);
  return { art, usage, clearCache };
}
