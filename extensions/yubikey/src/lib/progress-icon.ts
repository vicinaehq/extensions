import { Color, environment } from "@vicinae/api";

/** Green above 10s, orange from 10 down to 6, red for the last 5. */
export function urgency(remaining: number): "fresh" | "expiring" | "dead" {
  if (remaining <= 5) return "dead";
  if (remaining <= 10) return "expiring";
  return "fresh";
}

export function urgencyColor(remaining: number): Color {
  switch (urgency(remaining)) {
    case "dead":
      return Color.Red;
    case "expiring":
      return Color.Orange;
    default:
      return Color.Green;
  }
}

const STROKE = {
  fresh: "#4EC98B",
  expiring: "#E8833A",
  dead: "#E5484D",
} as const;

/**
 * Builds the data-URI of a ring for `secondsLeft` out of `period`.
 *
 * Not called on the hot path: the rings are precomputed by `ringTable` and only looked up.
 * Vicinae re-serializes the whole React tree every second, so building and escaping the string
 * per item per second would show up in the CPU profile. Here the string is built once per
 * (period, second) and reused.
 */
function buildRing(secondsLeft: number, period: number): string {
  const total = Math.max(period, 1);
  const left = Math.min(Math.max(secondsLeft, 0), total);
  const ratio = left / total;

  const r = 13;
  const c = 16;
  const circ = 2 * Math.PI * r;
  const filled = circ * ratio;

  const track = environment.appearance === "light" ? "#00000018" : "#FFFFFF20";
  const stroke = STROKE[urgency(left)];

  // A single <circle> over a track, with stroke-dasharray "filled rest". Much smaller than two
  // complete circles, and the data-URI is what dominates the per-second payload.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="13" fill="none" stroke="${track}" stroke-width="3"/>` +
    `<circle cx="16" cy="16" r="13" fill="none" stroke="${stroke}" stroke-width="3" ` +
    `stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${circ.toFixed(1)}" ` +
    `transform="rotate(-90 16 16)"/></svg>`;

  // base64 grows by a fixed 4/3; encodeURIComponent nearly doubles it (it escapes <, >, ", #, space).
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * Ring table per period: the 0..period states, built once on demand.
 *
 * The UI only does `ringTable(period)[secondsLeft]`, generating no SVG and escaping nothing on
 * the 1s tick.
 */
const cache = new Map<number, string[]>();

export function ringTable(period: number): string[] {
  const key = period || 30;
  let table = cache.get(key);
  if (!table) {
    table = Array.from({ length: key + 1 }, (_, s) => buildRing(s, key));
    cache.set(key, table);
  }
  return table;
}

export function countdownRing(secondsLeft: number, period: number): string {
  const table = ringTable(period);
  const idx = Math.min(Math.max(Math.ceil(secondsLeft), 0), table.length - 1);
  return table[idx];
}
