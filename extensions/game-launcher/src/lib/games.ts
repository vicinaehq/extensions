/**
 * Launcher-agnostic game model. Each launcher integration (Steam, Lutris, Heroic, ...)
 * produces `Game`s, and the UI only uses this type.
 */

export type GameSource = "steam" | "lutris" | "heroic";

export const LAUNCHER_NAMES: Record<GameSource, string> = { steam: "Steam", lutris: "Lutris", heroic: "Heroic" };

/**
 * Default launcher priority: when the same game is installed through several
 * launchers, the one listed first opens it. Users can reorder this.
 */
export const LAUNCHER_PRECEDENCE: readonly GameSource[] = ["steam", "lutris", "heroic"];

export interface GameArtwork {
  /** 2:3 cover art (the Steam library capsule). */
  portrait?: string;
  /** Landscape header / banner. */
  header?: string;
  hero?: string;
  logo?: string;
  /** Small square icon. */
  icon?: string;
}

/**
 * The launcher a game id belongs to. Game ids always start with "<GameSource>:" (e.g. "steam:1145350",
 * "lutris:42-tyrian-2000", "heroic:gog:1207658901"); this is the one place that relies on that format, for ids that may no
 * longer match a scanned game (e.g. stale hidden-game entries).
 */
export function sourceOfGameId(id: string): GameSource | undefined {
  const prefix = id.slice(0, id.indexOf(":"));
  return (LAUNCHER_PRECEDENCE as readonly string[]).includes(prefix) ? (prefix as GameSource) : undefined;
}

export interface Game {
  /**
   * Globally unique and stable: "<GameSource>:<launcher-specific id>", e.g. "steam:1145350". Used for
   * hiding games and as the React key. See sourceOfGameId.
   */
  id: string;
  source: GameSource;
  title: string;
  /** URI that launches the game, e.g. steam://rungameid/1145350. */
  launchUri: string;
  installDir?: string;
  sizeOnDisk?: number;
  /** Unix seconds; 0 when never played or unknown. */
  lastPlayed: number;
  playtimeMinutes?: number;
  /** Artwork found locally: custom art where the user set it, else the launcher's own cache (Steam: 1x resolution). */
  artwork: GameArtwork;
  /** User-chosen custom art (Steam: userdata/<id>/config/grid). Always wins over downloaded art. */
  customArtwork?: GameArtwork;
  /** For a merged entry: this launcher's own art, before gaps were filled in from other copies. */
  ownArtwork?: GameArtwork;
  /** Extra search terms (acronyms, app ids, install dir names). */
  keywords: string[];
  /**
   * Store identities, used to spot the same game in several launchers, e.g. ["steam:1145350"] for a
   * Steam game, or ["gog:1207658901"] for a GOG game installed through Lutris.
   */
  storeIds: string[];
  steam?: {
    appid: number;
    /** Lower-cased appinfo type ("game", "tool", ...), when known. */
    type?: string;
    isTool: boolean;
    /** appinfo clienticon hash: the multi-resolution .ico on Steam's CDN. */
    clientIcon?: string;
    /** Local copy of that .ico, if Steam has cached one (steam/games/<hash>.ico). */
    localIco?: string;
  };
  /**
   * The same game in other launchers, highest priority first, when copies are merged into one
   * entry. This entry's own fields (source, launchUri, id) are the preferred launcher's.
   */
  alternates?: Game[];
  lutris?: {
    id: number;
    slug: string;
    /** Lutris runner, e.g. "wine", "dosbox", "steam". */
    runner?: string;
    platform?: string;
    /** Store the game came from via a Lutris service, e.g. "gog", "egs", "steam". */
    service?: string;
  };
  heroic?: {
    appName: string;
    /** Heroic's store backend: "legendary" (Epic), "gog", "nile" (Amazon), "zoom" or "sideload". */
    runner: string;
    /** Platform of the installed build, e.g. "Windows" or "linux". */
    platform?: string;
    /** Store artwork URLs from Heroic's library, for downloading sharper copies. */
    artUrls: GameArtwork;
  };
}

/** A Heroic game's store backend and app name: what tells Heroic games apart. */
export type HeroicRef = Pick<NonNullable<Game["heroic"]>, "runner" | "appName">;

/** A Heroic game's id ("heroic:<runner>:<appName>"), which also keys its downloaded art. */
export function heroicGameId(runner: string, appName: string): string {
  return `heroic:${runner}:${appName}`;
}

/** What one launcher integration found. */
export interface LauncherScan {
  launcher: GameSource;
  /** An install of the launcher was found. */
  found: boolean;
  /** Where we looked / what we found, for the empty state. */
  sources: string[];
  games: Game[];
  collections: GameCollection[];
  /** Games hidden in the launcher itself (e.g. Steam's Hidden collection, Lutris's ".hidden" category). */
  hiddenInLauncher: Set<string>;
  /** False if the launcher's hidden list couldn't be read completely, so it can't be trusted for pruning. */
  hiddenListComplete: boolean;
  /** False if part of the launcher's library couldn't be scanned (e.g. an unmounted drive). */
  complete: boolean;
  warnings: string[];
  /** A preference for this launcher that couldn't be used. */
  settingsProblem?: string;
}

/** A launcher-defined group of games (e.g. Steam Favorites or a user collection). */
export interface GameCollection {
  /** Unique across launchers, e.g. "steam:favorite" or "steam:uc-abc". */
  id: string;
  name: string;
  source: GameSource;
  kind: "favorites" | "user";
  /** Game ids (e.g. "steam:1145350"); may include games that aren't installed. */
  gameIds: Set<string>;
}

/** Every copy of a (possibly merged) game: the preferred one first. */
export function copiesOf(game: Game): Game[] {
  return [game, ...(game.alternates ?? [])];
}

/** Every launcher a (possibly merged) game is installed through, preferred first. */
export function launchersOf(game: Game): GameSource[] {
  return copiesOf(game).map((c) => c.source);
}

/** Most recently played first, then alphabetical. */
export function compareGames(a: Game, b: Game): number {
  if (a.lastPlayed !== b.lastPlayed) return b.lastPlayed - a.lastPlayed;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
}

/**
 * Acronym used as a search keyword: "Kingdom Come: Deliverance II" -> "kcdii", "kcd".
 * Lets people type the abbreviations gamers actually use.
 */
export function acronyms(title: string): string[] {
  const words = title
    .replace(/[™®©]/g, "")
    .split(/[\s:\-–—_.,/&+]+/)
    .filter(Boolean);
  if (words.length < 2) return [];
  const isRoman = (w: string) => /^[IVX]+$/.test(w);
  const isNumber = (w: string) => /^\d+$/.test(w);
  const letters = words.map((w) => (isRoman(w) || isNumber(w) ? w : w[0]!)).join("");
  const core = words
    .filter((w) => !isRoman(w) && !isNumber(w))
    .map((w) => w[0]!)
    .join("");
  const out = new Set([letters.toLowerCase(), core.toLowerCase()]);
  return [...out].filter((a) => a.length >= 2);
}
