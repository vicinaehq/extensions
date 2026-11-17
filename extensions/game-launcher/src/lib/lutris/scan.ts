/**
 * The Lutris launcher integration. Games, play time and categories come from
 * Lutris's pga.db; artwork from its coverart/ and banners/ folders and its
 * icon theme dir. Launching uses Lutris's URL handler (lutris:rungameid/<id>).
 *
 * Categories map onto the same model as Steam's collections: "favorite" is
 * Favorites, ".hidden" is Lutris's hidden list, and other non-dot categories
 * are user collections.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { acronyms, type Game, type GameArtwork, type GameCollection, type LauncherScan } from "../games";
import { findLutrisInstalls, type LutrisInstall } from "./paths";
import { openReadOnly } from "./sqlite";

export interface LutrisScanOptions {
  /** Lutris Folder preference (the folder containing pga.db): when set, only it is used. */
  lutrisPath?: string;
  /** Also list store clients (Epic Games Store, Battle.net, ...); see isStoreClient. */
  includeStoreClients?: boolean;
  /** Home directory to auto-detect installs in (tests). */
  home?: string;
}

export interface LutrisLauncherScan extends LauncherScan {
  launcher: "lutris";
}

interface GameRow {
  id: number;
  configpath: string | null;
  slug: string | null;
  installer_slug: string | null;
  name: string | null;
  runner: string | null;
  platform: string | null;
  directory: string | null;
  lastplayed: number | null;
  playtime: number | null;
  service: string | null;
  service_id: string | null;
}

interface CategoryRow {
  game_id: number;
  slug: string | null;
  name: string;
}

/**
 * Game id for a Lutris game. SQLite reuses the highest row id after a delete, so the row id alone
 * could pass one game's hidden state to a later, different game; the slug makes a reused id distinct.
 * (Launching still uses the row id: lutris:rungameid/<id>.)
 */
export function lutrisGameId(rowId: number, slug: string | null): string {
  return `lutris:${rowId}-${slug ?? ""}`;
}

/** Lutris service ids, lower-cased and trimmed ("GOG " -> "gog"). */
export function normalizeService(service: string | null | undefined): string | undefined {
  return service?.trim().toLowerCase() || undefined;
}

/**
 * Store clients Lutris installs so a service's games can run. They're launchers, not games. Matched
 * the way Lutris finds them (each service's `client_installer`): by slug for the Epic Games Store,
 * EA app, Ubisoft Connect, Battle.net and Origin (the EA app's predecessor, still in older
 * libraries), and by installer slug for Steam under Wine. Any "steam" slug is the Steam client
 * too, whichever installer added it.
 */
const CLIENT_SLUGS = new Set(["epic-games-store", "ea-app", "origin", "ubisoft-connect", "battlenet", "steam"]);
const CLIENT_INSTALLER_SLUGS = new Set(["steam-wine"]);

export function isStoreClient(row: Pick<GameRow, "slug" | "installer_slug">): boolean {
  return (
    (row.slug !== null && CLIENT_SLUGS.has(row.slug)) ||
    (row.installer_slug !== null && CLIENT_INSTALLER_SLUGS.has(row.installer_slug))
  );
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => existsSync(p));
}

function artworkFor(install: LutrisInstall, slug: string): GameArtwork {
  const art: GameArtwork = {
    portrait: firstExisting(["jpg", "png"].map((ext) => join(install.dataDir, "coverart", `${slug}.${ext}`))),
    header: firstExisting(["jpg", "png"].map((ext) => join(install.dataDir, "banners", `${slug}.${ext}`))),
    icon: firstExisting([join(install.iconDir, `lutris_${slug}.png`)]),
  };
  return Object.fromEntries(Object.entries(art).filter(([, v]) => v)) as GameArtwork;
}

/**
 * The Steam app id from a Lutris game config (`game:\n  appid: '1527950'`). Lutris writes
 * this for games using the Steam runner, including ones added by hand without the Steam
 * service. A tiny line scan is enough for this one key; no YAML dependency needed.
 */
export function steamAppIdFromConfig(yaml: string): string | undefined {
  let inGame = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inGame = /^game:\s*$/.test(line);
      continue;
    }
    if (!inGame) continue;
    const m = /^\s+appid:\s*(['"]?)(\d+)\1\s*(#.*)?$/.exec(line);
    if (m) return m[2];
  }
  return undefined;
}

function readSteamAppId(install: LutrisInstall, configpath: string | null): string | undefined {
  if (!configpath) return undefined;
  for (const dir of install.gameConfigDirs) {
    try {
      return steamAppIdFromConfig(readFileSync(join(dir, `${configpath}.yml`), "utf8"));
    } catch {
      // not in this dir; try the next
    }
  }
  return undefined;
}

/**
 * Store identities for cross-launcher duplicate detection, e.g. "steam:1145350" or "gog:1207658901":
 * from the Lutris service a game came through, or for Steam-runner games, the app id in its config.
 */
export function storeIdsFor(row: Pick<GameRow, "service" | "service_id">, steamAppId?: string): string[] {
  const service = normalizeService(row.service);
  const id = row.service_id?.trim();
  const ids = service && id ? [`${service}:${id}`] : [];
  if (steamAppId && !ids.includes(`steam:${steamAppId}`)) ids.push(`steam:${steamAppId}`);
  return ids;
}

function toGame(install: LutrisInstall, row: GameRow): Game | undefined {
  if (!row.name || !row.slug) return undefined;
  const lastPlayed = row.lastplayed && row.lastplayed > 0 ? Math.floor(row.lastplayed) : 0;
  const playtimeMinutes = row.playtime && row.playtime > 0 ? Math.round(row.playtime * 60) : undefined; // Lutris stores hours
  const service = normalizeService(row.service);
  // Steam-runner games added by hand have no service link; their app id is only in the game's config.
  const steamAppId = row.runner === "steam" && service !== "steam" ? readSteamAppId(install, row.configpath) : undefined;
  return {
    id: lutrisGameId(row.id, row.slug),
    source: "lutris",
    title: row.name,
    launchUri: `lutris:rungameid/${row.id}`,
    installDir: row.directory || undefined,
    lastPlayed,
    playtimeMinutes,
    artwork: artworkFor(install, row.slug),
    keywords: [...acronyms(row.name), row.slug, row.runner, row.platform, service].filter((k): k is string => Boolean(k)),
    storeIds: storeIdsFor(row, steamAppId),
    lutris: {
      id: row.id,
      slug: row.slug,
      runner: row.runner || undefined,
      platform: row.platform || undefined,
      service,
    },
  };
}

function scanInstall(install: LutrisInstall, includeStoreClients: boolean) {
  const db = openReadOnly(join(install.dataDir, "pga.db"));
  try {
    const rows = db
      .prepare(
        "SELECT id, slug, installer_slug, name, runner, platform, directory, lastplayed, playtime, service, service_id, configpath FROM games WHERE installed = 1",
      )
      .all() as unknown as GameRow[];
    let categories: CategoryRow[] = [];
    let categoriesError: string | undefined;
    try {
      categories = db
        .prepare(
          "SELECT gc.game_id AS game_id, g.slug AS slug, c.name AS name FROM games_categories gc " +
            "JOIN categories c ON c.id = gc.category_id JOIN games g ON g.id = gc.game_id",
        )
        .all() as unknown as CategoryRow[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Very old databases have no categories tables: no favorites, hidden or collections then. Anything
      // else (e.g. "database is locked") means the hidden list is unknown, not empty.
      if (!/no such table/i.test(message)) categoriesError = message;
    }
    return {
      games: rows
        .filter((r) => includeStoreClients || !isStoreClient(r))
        .map((r) => toGame(install, r))
        .filter((g): g is Game => Boolean(g)),
      categories,
      categoriesError,
    };
  } finally {
    db.close();
  }
}

/**
 * Scan Lutris. Only one install is used (the Lutris Folder setting, else the first found: native,
 * then Flatpak). Each install numbers its games from 1 and the lutris: URL reaches only one of them,
 * so mixing installs would need per-install ids and launch commands; other installs are just noted.
 */
export function scanLutris(options: LutrisScanOptions = {}): LutrisLauncherScan {
  const [install, ...others] = findLutrisInstalls({ override: options.lutrisPath, home: options.home });
  const installs = install ? [install] : [];
  const result: LutrisLauncherScan = {
    launcher: "lutris",
    found: installs.length > 0,
    sources: [],
    games: [],
    collections: [],
    hiddenInLauncher: new Set(),
    hiddenListComplete: installs.length > 0,
    complete: installs.length > 0,
    warnings: [],
    settingsProblem:
      options.lutrisPath?.trim() && installs.length === 0
        ? `The Lutris Folder setting doesn't point at a Lutris data folder (no pga.db): ${options.lutrisPath.trim()}`
        : undefined,
  };

  for (const other of others) {
    result.warnings.push(
      `Also found Lutris (${other.kind}) at ${other.dataDir}; only the ${install!.kind} install is used. ` +
        "Set the Lutris Folder setting to use a different one.",
    );
  }

  const collections = new Map<string, GameCollection>();
  for (const install of installs) {
    result.sources.push(`Lutris (${install.kind}): ${install.dataDir}`);
    let scanned: ReturnType<typeof scanInstall>;
    try {
      scanned = scanInstall(install, options.includeStoreClients ?? false);
    } catch (err) {
      result.complete = false;
      result.hiddenListComplete = false;
      result.warnings.push(
        `Couldn't read Lutris's game database at ${install.dataDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    result.games.push(...scanned.games);
    if (scanned.categoriesError) {
      result.hiddenListComplete = false;
      result.warnings.push(`Couldn't read Lutris's categories at ${install.dataDir}: ${scanned.categoriesError}`);
    }
    for (const { game_id, slug, name } of scanned.categories) {
      const gameId = lutrisGameId(game_id, slug);
      if (name === ".hidden") {
        result.hiddenInLauncher.add(gameId);
      } else if (!name.startsWith(".") && name !== "all") {
        const id = `lutris:${name === "favorite" ? "favorite" : `category:${name}`}`;
        const existing = collections.get(id);
        if (existing) existing.gameIds.add(gameId);
        else {
          collections.set(id, {
            id,
            name: name === "favorite" ? "Favorites" : name,
            source: "lutris",
            kind: name === "favorite" ? "favorites" : "user",
            gameIds: new Set([gameId]),
          });
        }
      }
    }
  }

  result.collections = [...collections.values()].sort((a, b) =>
    a.kind !== b.kind ? Number(b.kind === "favorites") - Number(a.kind === "favorites") : a.name.localeCompare(b.name),
  );
  return result;
}
