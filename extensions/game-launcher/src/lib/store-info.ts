/** How a game's store and platform are shown. Kept free of @vicinae/api imports so it can be unit-tested. */
import { copiesOf, type Game, type GameSource } from "./games";
import { HEROIC_STORES } from "./heroic/scan";

/** Display names for store ids (Lutris service ids, which Heroic games use too: see HEROIC_STORES). */
const STORE_NAMES: Record<string, string> = {
  gog: "GOG",
  egs: "Epic Games Store",
  steam: "Steam",
  ubisoft: "Ubisoft Connect",
  ea_app: "EA app",
  battlenet: "Battle.net",
  amazon: "Amazon Games",
  itchio: "itch.io",
  humblebundle: "Humble Bundle",
  zoomplatform: "ZOOM Platform",
};

/** Heroic platform names as shown to the user ("linux" -> "Linux"). */
const PLATFORM_NAMES: Record<string, string> = { windows: "Windows", linux: "Linux", mac: "macOS", osx: "macOS" };

export function storeName(storeId: string): string {
  return STORE_NAMES[storeId] ?? storeId;
}

/** A copy's own store id, platform and runner, as far as its launcher records them. */
function copyInfo(copy: Game): { storeId?: string; platform?: string; runner?: string } {
  if (copy.source === "lutris" && copy.lutris) {
    return { storeId: copy.lutris.service, platform: copy.lutris.platform, runner: copy.lutris.runner };
  }
  if (copy.source === "heroic" && copy.heroic) {
    return { storeId: HEROIC_STORES[copy.heroic.runner]?.storeId, platform: copy.heroic.platform };
  }
  return {};
}

export interface LauncherDetails {
  /** The launcher whose copy these details describe. */
  source?: GameSource;
  store?: string;
  platform?: string;
  /** Lutris runner, e.g. "wine". */
  runner?: string;
}

/**
 * Store, platform and runner to show for a (possibly merged) game, all from one copy: the first,
 * preferred first, that records any of them. Mixing copies could pair one copy's store with
 * another's platform, describing a build that isn't the one launched. A Steam copy has nothing to
 * add ("Launcher: Steam" says it all) but still stops the search, so another launcher's details
 * aren't shown for a game Steam launches.
 */
export function launcherDetails(game: Game): LauncherDetails {
  for (const copy of copiesOf(game)) {
    if (copy.source === "steam") return { source: "steam" };
    const info = copyInfo(copy);
    if (!info.storeId && !info.platform && !info.runner) continue;
    return {
      source: copy.source,
      store: info.storeId ? storeName(info.storeId) : undefined,
      platform: info.platform ? (PLATFORM_NAMES[info.platform.toLowerCase()] ?? info.platform) : undefined,
      runner: info.runner,
    };
  }
  return {};
}
