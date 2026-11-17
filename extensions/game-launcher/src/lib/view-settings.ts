/**
 * Turns the raw display preferences into concrete view settings.
 * Kept free of @vicinae/api imports so it can be unit-tested.
 */
import type { Game, GameArtwork } from "./games";

export type Layout = "grid" | "list" | "list-detail";
export type ArtworkStyle = "cover" | "banner" | "hero" | "logo";
export type Labels = "full" | "title" | "none";
export type AspectRatio = "2/3" | "16/9" | "21/9";

export interface ViewSettings {
  layout: Layout;
  artwork: ArtworkStyle;
  columns: number;
  aspectRatio: AspectRatio;
  /** "fill" crops to the cell, "contain" letterboxes (used for transparent logos). */
  fit: "fill" | "contain";
  labels: Labels;
}

export interface RawDisplayPreferences {
  layout?: string;
  artwork?: string;
  gridSize?: string;
  labels?: string;
}

interface ArtworkSpec {
  aspectRatio: AspectRatio;
  fit: "fill" | "contain";
  /** Columns used when the grid size is "auto". */
  autoColumns: number;
  /** Which artwork fields to try, best first. */
  sources: (keyof GameArtwork)[];
}

export const ARTWORK_SPECS: Record<ArtworkStyle, ArtworkSpec> = {
  // Steam library capsule, 600x900.
  cover: { aspectRatio: "2/3", fit: "fill", autoColumns: 5, sources: ["portrait", "header"] },
  // Store header, 460x215 (~2.14:1): 21:9 crops a sliver top and bottom.
  banner: { aspectRatio: "21/9", fit: "fill", autoColumns: 3, sources: ["header", "hero", "portrait"] },
  // Library hero, 1920x620 (~3.1:1): Steam itself crops the sides responsively.
  hero: { aspectRatio: "21/9", fit: "fill", autoColumns: 2, sources: ["hero", "header", "portrait"] },
  // Transparent logo, letterboxed so it is never cut off.
  logo: { aspectRatio: "16/9", fit: "contain", autoColumns: 4, sources: ["logo", "header", "portrait"] },
};

const LAYOUTS: readonly Layout[] = ["grid", "list", "list-detail"];
const LABELS: readonly Labels[] = ["full", "title", "none"];
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 8;

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function resolveViewSettings(prefs: RawDisplayPreferences): ViewSettings {
  const artwork = oneOf(prefs.artwork, Object.keys(ARTWORK_SPECS) as ArtworkStyle[], "cover");
  const spec = ARTWORK_SPECS[artwork];
  const requested = Number(prefs.gridSize);
  const columns =
    Number.isInteger(requested) && requested >= MIN_COLUMNS && requested <= MAX_COLUMNS ? requested : spec.autoColumns;
  return {
    layout: oneOf(prefs.layout, LAYOUTS, "grid"),
    artwork,
    columns,
    aspectRatio: spec.aspectRatio,
    fit: spec.fit,
    labels: oneOf(prefs.labels, LABELS, "full"),
  };
}

export interface ResolvedImage {
  source: string;
  /** Next-best image if `source` fails to load. */
  fallback?: string;
}

/**
 * Pick the artwork for a style. For each kind the style accepts (best first):
 * the user's custom art, then the downloaded high-resolution copy, then the
 * launcher's local (1x) copy.
 */
export function pickArtwork(game: Game, style: ArtworkStyle, hires: GameArtwork = {}): ResolvedImage | undefined {
  const found: string[] = [];
  for (const kind of ARTWORK_SPECS[style].sources) {
    for (const path of [game.customArtwork?.[kind], hires[kind], game.artwork[kind]]) {
      if (path && !found.includes(path)) found.push(path);
    }
  }
  return found[0] ? { source: found[0], fallback: found[1] } : undefined;
}

/**
 * Icon for list rows: custom icon if set, else a sharp (>= 64px) icon extracted from the game's client
 * .ico when one exists, otherwise Steam's 32px community icon. Vicinae's list
 * icons are a fixed small size, so cover art would only appear shrunken.
 */
export function pickListIcon(game: Game, hires: GameArtwork = {}): ResolvedImage | undefined {
  const found = [game.customArtwork?.icon, hires.icon, game.artwork.icon].filter(
    (c, i, all): c is string => Boolean(c) && all.indexOf(c) === i,
  );
  return found[0] ? { source: found[0], fallback: found[1] } : undefined;
}
