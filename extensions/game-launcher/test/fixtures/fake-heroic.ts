/** Builds a throwaway Heroic config folder for tests, in the layout Heroic 2.x writes. */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { writeFile } from "./fake-steam";

export interface FakeHeroic {
  /** legendaryConfig/legendary/installed.json: app name -> install record. */
  legendaryInstalled?: Record<string, Record<string, unknown>>;
  /** legendaryConfig/legendary/third-party-installed.json: [appName, platform] pairs. */
  thirdParty?: [string, string][];
  /** gog_store/installed.json "installed" entries. */
  gogInstalled?: Record<string, unknown>[];
  /** zoom_store/installed.json "installed" entries. */
  zoomInstalled?: Record<string, unknown>[];
  /** nile_config/nile/installed.json entries. */
  nileInstalled?: Record<string, unknown>[];
  /** sideload_apps/library.json "games". */
  sideloaded?: Record<string, unknown>[];
  /** store_cache/<runner>_library.json entries (titles and art URLs). */
  libraries?: Partial<Record<"legendary" | "gog" | "nile" | "zoom", Record<string, unknown>[]>>;
  /** store/timestamp.json. */
  timestamps?: Record<string, { lastPlayed?: string; totalPlayed?: number }>;
  /** store/config.json "games" (favourites, hidden, customCategories). */
  games?: Record<string, unknown>;
}

const LIBRARY_FILES = {
  legendary: ["legendary_library.json", "library"],
  gog: ["gog_library.json", "games"],
  nile: ["nile_library.json", "library"],
  zoom: ["zoom_library.json", "games"],
} as const;

export function makeHeroicConfig(root: string, data: FakeHeroic = {}): string {
  const json = (rel: string, value: unknown) => writeFile(join(root, rel), JSON.stringify(value));
  json("config.json", { defaultSettings: {}, version: "v0" });
  json("store/config.json", { language: "en", ...(data.games ? { games: data.games } : {}) });
  if (data.legendaryInstalled) json("legendaryConfig/legendary/installed.json", data.legendaryInstalled);
  if (data.thirdParty) json("legendaryConfig/legendary/third-party-installed.json", data.thirdParty);
  if (data.gogInstalled) json("gog_store/installed.json", { installed: data.gogInstalled });
  if (data.zoomInstalled) json("zoom_store/installed.json", { installed: data.zoomInstalled });
  if (data.nileInstalled) json("nile_config/nile/installed.json", data.nileInstalled);
  if (data.sideloaded) json("sideload_apps/library.json", { games: data.sideloaded });
  for (const [runner, games] of Object.entries(data.libraries ?? {})) {
    const [file, key] = LIBRARY_FILES[runner as keyof typeof LIBRARY_FILES];
    json(`store_cache/${file}`, { [key]: games, __timestamp: {} });
  }
  if (data.timestamps) json("store/timestamp.json", data.timestamps);
  return root;
}

/** Put an image into Heroic's image cache as its UI would for this (already formatted) URL. */
export function heroicCachedImage(root: string, url: string): string {
  return writeFile(join(root, "images-cache", createHash("sha256").update(url).digest("hex")), "img");
}

export function flatpakHeroic(home: string): string {
  return join(home, ".var/app/com.heroicgameslauncher.hgl/config/heroic");
}
