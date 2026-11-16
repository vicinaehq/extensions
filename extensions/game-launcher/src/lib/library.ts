import {
  compareGames,
  type Game,
  type GameArtwork,
  type GameCollection,
  type GameSource,
  type HeroicRef,
  LAUNCHER_NAMES,
  LAUNCHER_PRECEDENCE,
  type LauncherScan,
} from "./games";
import { scanHeroic } from "./heroic/scan";
import { normalizePriority } from "./launcher-priority";
import { scanLutris } from "./lutris/scan";
import { scanSteam } from "./steam/scan";

export interface LibraryOptions {
  /** Launchers to scan (default: all). A disabled launcher isn't touched at all. */
  enabledLaunchers?: readonly GameSource[];
  steamPath?: string;
  includeNonGames?: boolean;
  lutrisPath?: string;
  /** Also list launcher store clients (Lutris's Epic Games Store, Battle.net, ...). */
  includeStoreClients?: boolean;
  heroicPath?: string;
  /** Show a game installed through several launchers as one entry, opened with the preferred launcher. */
  hideDuplicates?: boolean;
  /** Launcher priority, highest first (default: LAUNCHER_PRECEDENCE). */
  launcherPriority?: readonly GameSource[];
  /** Where to persist appinfo.vdf lookups between runs. Without it, appinfo.vdf is read on every scan. */
  appInfoCachePath?: string;
  /** Home directory to auto-detect launchers in (tests). Defaults to the real one. */
  home?: string;
}

export interface LibraryScan {
  /** Every installed game (hidden ones included), duplicates removed if requested, most recently played first. */
  games: Game[];
  /** Per enabled launcher, in priority order. */
  launchers: LauncherScan[];
  /** The launcher priority used (all launchers, highest first). */
  priority: GameSource[];
  enabledLaunchers: GameSource[];
  warnings: string[];
  /** Where we looked / what we found, for the empty state. */
  sources: string[];
  /** Preferences that couldn't be used (e.g. a Steam Folder that isn't a Steam install). */
  settingsProblems: string[];
  /** Launcher collections (Favorites, user collections), in launcher priority order. */
  collections: GameCollection[];
  /** Games hidden in their own launcher (Steam's Hidden collection, Lutris's ".hidden" category). */
  hiddenInLauncher: Set<string>;
  /**
   * Launchers whose hidden list was read completely this scan. Only for these is it safe to forget
   * "shown here" overrides for games the launcher no longer hides.
   */
  hiddenListsComplete: Set<GameSource>;
  /** Installed Steam app ids (tools and apps mid-update included), for pruning Steam-keyed caches. */
  installedSteamAppids: Set<number>;
  /** Steam was enabled and fully scanned: safe to prune Steam-keyed caches. */
  steamComplete: boolean;
  /** Installed Heroic games, when Heroic was enabled and fully scanned (for pruning Heroic artwork). */
  installedHeroicGames?: HeroicRef[];
}

export interface MergeResult {
  games: Game[];
  /** Id of a copy merged into another entry -> id of the entry it's shown as. */
  aliases: Map<string, string>;
}

function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

/** First value per artwork kind across copies, in priority order. */
function mergeArtwork(arts: (GameArtwork | undefined)[]): GameArtwork {
  const merged: GameArtwork = {};
  for (const art of arts) {
    for (const [kind, path] of Object.entries(art ?? {}) as [keyof GameArtwork, string | undefined][]) {
      if (path && !merged[kind]) merged[kind] = path;
    }
  }
  return merged;
}

/**
 * One entry for a game installed through several launchers. Launching, id and source come from
 * the preferred copy; other copies become `alternates` ("Launch with …" actions). Last played and
 * playtime take the largest value (summing would double-count launches that go through both
 * launchers), and missing artwork is filled in from other copies. Steam's metadata (for store
 * actions and hi-res art) is kept from whichever copy has it; other launchers' details stay on their
 * own copy (see launcherDetails).
 */
export function mergeCopies(preferred: Game, others: Game[]): Game {
  if (others.length === 0) return preferred;
  const copies = [preferred, ...others];
  const playtimes = copies.map((c) => c.playtimeMinutes).filter((m): m is number => m !== undefined);
  return {
    ...preferred,
    lastPlayed: Math.max(...copies.map((c) => c.lastPlayed)),
    playtimeMinutes: playtimes.length ? Math.max(...playtimes) : undefined,
    installDir: copies.find((c) => c.installDir)?.installDir,
    sizeOnDisk: copies.find((c) => c.sizeOnDisk)?.sizeOnDisk,
    artwork: mergeArtwork(copies.map((c) => c.artwork)),
    ownArtwork: preferred.artwork,
    customArtwork: mergeArtwork(copies.map((c) => c.customArtwork)),
    keywords: unique(copies.flatMap((c) => c.keywords)),
    storeIds: unique(copies.flatMap((c) => c.storeIds)),
    steam: copies.find((c) => c.steam)?.steam,
    alternates: others,
  };
}

/**
 * Merge copies of the same game across launchers, matched by store id (e.g. a Steam game
 * Lutris also manages has "steam:<appid>", like Steam's own copy). The copy from the launcher
 * earliest in `priority` becomes the entry; the rest become its alternates.
 *
 * Only copies from *different* launchers merge: two copies inside one launcher (e.g. a GOG
 * game installed twice in Lutris) stay separate entries, since "Launch with Lutris" twice
 * couldn't tell them apart.
 */
export function mergeByPriority(games: readonly Game[], priority: readonly GameSource[] = LAUNCHER_PRECEDENCE): MergeResult {
  const rank = (g: Game) => {
    const i = priority.indexOf(g.source);
    return i === -1 ? priority.length : i;
  };
  const ordered = [...games].sort((a, b) => rank(a) - rank(b));
  const claimed = new Map<string, Game>(); // store id -> preferred copy
  const groups = new Map<Game, Game[]>(); // preferred copy -> other copies
  const aliases = new Map<string, string>();
  for (const game of ordered) {
    const preferred = game.storeIds.map((id) => claimed.get(id)).find((g) => g !== undefined);
    const group = preferred && groups.get(preferred)!;
    if (preferred && group && preferred.source !== game.source && !group.some((c) => c.source === game.source)) {
      group.push(game);
      aliases.set(game.id, preferred.id);
      continue;
    }
    groups.set(game, []);
    // A same-launcher copy stays separate and doesn't take over store ids already claimed.
    for (const id of game.storeIds) if (!claimed.has(id)) claimed.set(id, game);
  }
  return { games: [...groups].map(([preferred, others]) => mergeCopies(preferred, others)), aliases };
}

/** Raw per-launcher results from disk, before merging. Re-merging (e.g. a priority change) doesn't need a rescan. */
export interface LauncherScans {
  /** Enabled launchers' results, in default order. */
  launchers: LauncherScan[];
  enabledLaunchers: GameSource[];
  installedSteamAppids: Set<number>;
  steamComplete: boolean;
  installedHeroicGames?: HeroicRef[];
}

/** Scan every enabled launcher on disk (synchronous; the expensive part). */
export function scanLaunchers(options: Omit<LibraryOptions, "launcherPriority" | "hideDuplicates"> = {}): LauncherScans {
  const enabled = LAUNCHER_PRECEDENCE.filter((l) => !options.enabledLaunchers || options.enabledLaunchers.includes(l));
  const launchers: LauncherScan[] = [];
  let installedSteamAppids = new Set<number>();
  let steamComplete = false;
  let installedHeroicGames: HeroicRef[] | undefined;
  for (const launcher of enabled) {
    if (launcher === "steam") {
      const steam = scanSteam({
        steamPath: options.steamPath,
        includeTools: options.includeNonGames,
        appInfoCachePath: options.appInfoCachePath,
        home: options.home,
      });
      installedSteamAppids = steam.installedAppids;
      steamComplete = steam.complete;
      launchers.push(steam);
    } else if (launcher === "lutris") {
      launchers.push(
        scanLutris({ lutrisPath: options.lutrisPath, includeStoreClients: options.includeStoreClients, home: options.home }),
      );
    } else if (launcher === "heroic") {
      const heroic = scanHeroic({ heroicPath: options.heroicPath, home: options.home });
      if (heroic.complete) installedHeroicGames = heroic.games.map((g) => ({ runner: g.heroic!.runner, appName: g.heroic!.appName }));
      launchers.push(heroic);
    }
  }
  return { launchers, enabledLaunchers: enabled, installedSteamAppids, steamComplete, installedHeroicGames };
}

/** Merge launcher results into one sorted list (in memory; cheap enough to redo on every priority change). */
export function combineLibrary(
  raw: LauncherScans,
  options: { launcherPriority?: readonly GameSource[]; hideDuplicates?: boolean } = {},
): LibraryScan {
  const priority = normalizePriority(options.launcherPriority ?? LAUNCHER_PRECEDENCE);
  const rank = (l: GameSource) => priority.indexOf(l);
  const launchers = [...raw.launchers].sort((a, b) => rank(a.launcher) - rank(b.launcher));
  const all = launchers.flatMap((l) => l.games);
  const { games, aliases } =
    options.hideDuplicates === false ? { games: all, aliases: new Map<string, string>() } : mergeByPriority(all, priority);

  // A merged copy's collection memberships carry over to the entry it's shown as,
  // so e.g. a Lutris favorite that's also a Steam game still appears in Lutris > Favorites.
  const collections = launchers.flatMap((l) =>
    l.collections.map((c) => ({ ...c, gameIds: new Set([...c.gameIds].map((id) => aliases.get(id) ?? id)) })),
  );

  return {
    games: [...games].sort(compareGames),
    launchers,
    priority,
    enabledLaunchers: priority.filter((l) => raw.enabledLaunchers.includes(l)),
    warnings: launchers.flatMap((l) => l.warnings),
    sources: launchers.flatMap((l) => l.sources),
    settingsProblems: launchers.flatMap((l) => (l.settingsProblem ? [l.settingsProblem] : [])),
    collections,
    hiddenInLauncher: new Set(launchers.flatMap((l) => [...l.hiddenInLauncher])),
    hiddenListsComplete: new Set(launchers.filter((l) => l.hiddenListComplete).map((l) => l.launcher)),
    installedSteamAppids: raw.installedSteamAppids,
    steamComplete: raw.steamComplete,
    installedHeroicGames: raw.installedHeroicGames,
  };
}

/** Scan every enabled launcher and return one sorted list. */
export function scanLibrary(options: LibraryOptions = {}): LibraryScan {
  return combineLibrary(scanLaunchers(options), options);
}

export interface EmptyStateText {
  title: string;
  description: string;
}

const NOT_FOUND_HINT: Record<GameSource, string> = {
  steam: "not found in the usual native, Flatpak and Snap locations",
  lutris: "not found in the usual native and Flatpak locations",
  heroic: "not found in the usual native and Flatpak locations",
};

/** What to tell the user when the scan found no games. */
export function emptyStateText(scan: LibraryScan): EmptyStateText {
  if (scan.enabledLaunchers.length === 0) {
    return { title: "All launchers are turned off", description: "Turn on Steam, Lutris or Heroic in Settings (Ctrl+,)." };
  }
  if (!scan.launchers.some((l) => l.found)) {
    const lines = scan.launchers.map(
      (l) => l.settingsProblem ?? `${LAUNCHER_NAMES[l.launcher]}: ${NOT_FOUND_HINT[l.launcher]}.`,
    );
    lines.push(
      "",
      scan.settingsProblems.length
        ? "Fix it in Settings (Ctrl+,)."
        : "If a launcher is installed somewhere else, set its folder in Settings (Ctrl+,).",
    );
    const only = scan.launchers.length === 1 ? scan.launchers[0] : undefined;
    return {
      title: only ? `No ${LAUNCHER_NAMES[only.launcher]} install found` : "No game launchers found",
      description: lines.join("\n"),
    };
  }
  const lines = ["Looked in:", ...scan.sources.map((s) => `• ${s}`)];
  if (scan.settingsProblems.length) lines.push("", ...scan.settingsProblems);
  if (scan.warnings.length) lines.push("", ...scan.warnings);
  return { title: "No games found", description: lines.join("\n") };
}
