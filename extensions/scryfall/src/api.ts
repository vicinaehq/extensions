/** Minimal Scryfall client: card search with a typed result and error. */

const API_BASE = "https://api.scryfall.com";
const SITE_BASE = "https://scryfall.com";

export interface CardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: Record<string, string>;
}

export interface Card extends CardFace {
  id: string;
  scryfall_uri: string;
  set: string;
  set_name: string;
  rarity: string;
  cmc: number;
  card_faces?: CardFace[];
  prices: Record<string, string | null>;
  legalities: Record<string, string>;
}

export interface SearchResult {
  cards: Card[];
  total: number;
}

export class ScryfallError extends Error {}

/** Page on scryfall.com showing the full results for `query`. */
export function searchUrl(query: string): string {
  return `${SITE_BASE}/search?q=${encodeURIComponent(query)}`;
}

/** Search cards. No matches is an empty result, not an error. */
export async function searchCards(query: string, signal: AbortSignal): Promise<SearchResult> {
  const url = `${API_BASE}/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`;
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": "vicinae-scryfall", Accept: "application/json" },
  });

  if (response.status === 404) return { cards: [], total: 0 };

  const body = (await response.json().catch(() => undefined)) as
    | { data?: Card[]; total_cards?: number; details?: string }
    | undefined;

  if (!response.ok) {
    throw new ScryfallError(body?.details ?? `Scryfall returned HTTP ${response.status}`);
  }
  return { cards: body?.data ?? [], total: body?.total_cards ?? body?.data?.length ?? 0 };
}
