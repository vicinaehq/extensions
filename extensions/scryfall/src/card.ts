import type { Card } from "./api";

/** Image of the front face; double-faced cards keep images on the faces. */
export function imageUrl(card: Card): string | undefined {
  return (card.image_uris ?? card.card_faces?.[0]?.image_uris)?.normal;
}

export function manaCost(card: Card): string {
  return card.mana_cost ?? card.card_faces?.map((f) => f.mana_cost).filter(Boolean).join(" // ") ?? "";
}

export function typeLine(card: Card): string {
  return card.type_line ?? card.card_faces?.map((f) => f.type_line).filter(Boolean).join(" // ") ?? "";
}

export function oracleText(card: Card): string {
  if (card.oracle_text) return card.oracle_text;
  return (card.card_faces ?? [])
    .map((f) => `${f.name}\n${f.oracle_text ?? ""}`.trim())
    .join("\n\n");
}

export function formatPrices(card: Card): string {
  const parts = [
    card.prices.usd && `$${card.prices.usd}`,
    card.prices.usd_foil && `$${card.prices.usd_foil} foil`,
    card.prices.eur && `€${card.prices.eur}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "N/A";
}

const FORMAT_NAMES: Record<string, string> = {
  standard: "Standard",
  future: "Future",
  historic: "Historic",
  timeless: "Timeless",
  gladiator: "Gladiator",
  pioneer: "Pioneer",
  modern: "Modern",
  legacy: "Legacy",
  pauper: "Pauper",
  vintage: "Vintage",
  penny: "Penny Dreadful",
  commander: "Commander",
  oathbreaker: "Oathbreaker",
  standardbrawl: "Standard Brawl",
  brawl: "Brawl",
  alchemy: "Alchemy",
  paupercommander: "Pauper Commander",
  duel: "Duel Commander",
  oldschool: "Old School",
  premodern: "Premodern",
  predh: "Pre-EDH",
};

/** Formats where the card is legal or restricted, e.g. "Standard, Vintage (Restricted)". */
export function legalFormats(card: Card): string {
  const formats = Object.entries(card.legalities)
    .filter(([, status]) => status === "legal" || status === "restricted")
    .map(([format, status]) => {
      const name = FORMAT_NAMES[format] ?? format.charAt(0).toUpperCase() + format.slice(1);
      return status === "restricted" ? `${name} (Restricted)` : name;
    });
  return formats.length ? formats.join(", ") : "None";
}
