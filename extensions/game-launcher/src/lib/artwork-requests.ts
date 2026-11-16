/** Which artwork to cache for which games. Pure, so it can be unit-tested without Vicinae. */
import type { ArtworkRequest, CachedKind } from "./artwork-cache";
import { copiesOf, type Game, type GameArtwork, heroicGameId } from "./games";
import type { ViewSettings } from "./view-settings";

/** Which cached artwork kinds the current layout actually displays. */
export function neededKinds(settings: ViewSettings): CachedKind[] {
  if (settings.layout === "grid") {
    if (settings.artwork === "cover") return ["portrait"];
    if (settings.artwork === "banner") return ["header"];
    // Steam's hero and logo art is already full resolution locally; Heroic's has to be downloaded.
    return [settings.artwork];
  }
  // Lists: the row icon plus the banner shown in the details pane.
  return ["icon", "header"];
}

/**
 * Which copy of a (possibly merged) game the artwork cache uses: the Steam copy if there is one
 * (its CDN art is the sharpest), else a Heroic copy. Undefined when no copy has downloadable art.
 */
function artCopy(game: Game): Game | undefined {
  if (game.steam) return copiesOf(game).find((c) => c.source === "steam") ?? game;
  return copiesOf(game).find((c) => c.source === "heroic" && c.heroic);
}

/** Key of a game's downloaded art (see artKeyOf): stable whichever launcher's copy an entry is shown as. */
export function artKeyFor(game: Game): string | undefined {
  if (game.steam) return `steam:${game.steam.appid}`;
  const heroic = artCopy(game)?.heroic;
  return heroic ? heroicGameId(heroic.runner, heroic.appName) : undefined;
}

/** Heroic art URLs to try per kind: a wide image stands in for a missing wide image of the other kind. */
const HEROIC_URL_KINDS: Record<CachedKind, (keyof GameArtwork)[]> = {
  portrait: ["portrait"],
  header: ["header", "hero"],
  hero: ["hero", "header"],
  logo: ["logo"],
  icon: ["icon"],
};

/** Sizes to ask Epic's CDN for (its art is up to 1920px; this is plenty for 2x on HiDPI screens). */
const EPIC_SIZES: Partial<Record<CachedKind, { w: number; h: number }>> = {
  portrait: { w: 600, h: 800 },
  header: { w: 1280, h: 720 },
  hero: { w: 1280, h: 720 },
};

function heroicUrl(runner: string, kind: CachedKind, url: string): string {
  const size = runner === "legendary" ? EPIC_SIZES[kind] : undefined;
  return size && !url.includes("?") ? `${url}?h=${size.h}&resize=1&w=${size.w}` : url;
}

/** The cache request for a game's artwork kind, or undefined when there's nothing to fetch. */
export function requestFor(game: Game, kind: CachedKind): ArtworkRequest | undefined {
  // The user's own custom art always wins, so a download would never be shown.
  if (game.customArtwork?.[kind]) return undefined;
  const copy = artCopy(game);
  if (!copy) return undefined;
  // For a merged entry, look at that copy's own art (not gaps filled in from other copies), so
  // requests stay the same whichever launcher is preferred.
  const ownArt = (copy === game ? game.ownArtwork : undefined) ?? copy.artwork;

  if (game.steam) {
    if (kind === "hero" || kind === "logo") return undefined; // full resolution locally
    // Whether *Steam* has a local copy decides if a 1x download would be redundant.
    return {
      appid: game.steam.appid,
      kind,
      hasLocal: Boolean(ownArt[kind]),
      clientIcon: game.steam.clientIcon,
      localIco: game.steam.localIco,
    };
  }

  const heroic = copy.heroic!;
  const url = HEROIC_URL_KINDS[kind].map((k) => heroic.artUrls[k]).find(Boolean);
  // Heroic's own icon (icons/<appName>) is all a list row needs; only download one when it has none.
  if (!url || (kind === "icon" && ownArt.icon)) return undefined;
  return { runner: heroic.runner, appName: heroic.appName, kind, url: heroicUrl(heroic.runner, kind, url) };
}
