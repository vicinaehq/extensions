import { environment } from "@vicinae/api";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GLYPHS } from "./manaGlyphs";

const INK = "#0D0F0F";
const GENERIC = "#CAC5C0";
const COLORS: Record<string, string> = {
  w: "#F8F6D8",
  u: "#C1D7E9",
  b: "#BAB1AB",
  r: "#E49977",
  g: "#A3C095",
  c: GENERIC,
};

function glyph(name: string, cx: number, cy: number, size: number): string {
  const path = GLYPHS[name];
  if (!path) return "";
  const scale = size / 32;
  return `<path fill="${INK}" transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${scale})" d="${path}"/>`;
}

/** SVG for one mana symbol such as "{R}", "{2}", "{W/U}", "{2/W}" or "{G/P}". */
function symbolBody(token: string, id: string): string {
  const parts = token.toLowerCase().split("/");
  const phyrexian = parts.includes("p");
  const mana = parts.filter((p) => p !== "p");
  const fills = mana.map((p) => COLORS[p] ?? GENERIC);

  let body: string;
  if (fills.length >= 2) {
    body =
      `<clipPath id="${id}"><circle cx="16" cy="16" r="16"/></clipPath>` +
      `<g clip-path="url(#${id})">` +
      `<polygon fill="${fills[0]}" points="0,0 32,0 0,32"/>` +
      `<polygon fill="${fills[1]}" points="32,0 32,32 0,32"/></g>`;
    if (!phyrexian) body += glyph(mana[0], 10, 10, 13) + glyph(mana[1], 22, 22, 13);
    else body += glyph("p", 16, 16, 18);
  } else {
    body = `<circle cx="16" cy="16" r="16" fill="${fills[0] ?? GENERIC}"/>`;
    body += glyph(phyrexian ? "p" : mana[0], 16, 16, 19);
  }
  return body;
}

function symbolSvg(token: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${symbolBody(token, "c")}</svg>`;
}

/** Write the symbol's SVG to the support directory (once) and return its path. */
function symbolFile(token: string): string {
  const dir = join(environment.supportPath, "mana-v1");
  const file = join(dir, `${token.toLowerCase().replace(/\//g, "-")}.svg`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, symbolSvg(token));
  }
  return file;
}

/** One entry per symbol in a mana cost; multi-face costs are separated by a "//" entry. */
export function manaSymbols(cost: string): ({ icon: string } | { text: string })[] {
  return cost.split(" // ").flatMap((face, i) => {
    const symbols = [...face.matchAll(/\{([^}]+)\}/g)].map(([, token]) => ({ icon: symbolFile(token) }));
    return i === 0 ? symbols : [{ text: "//" }, ...symbols];
  });
}
