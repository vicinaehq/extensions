import { CLAIM_NAMES, orderClaims, TIME_CLAIMS } from "./claims.ts";
import { type Claims, formatClaimTimeCompact } from "./jwt.ts";

/** Matches a top-level claim line. Nested array items and object fields get no comment. */
const CLAIM_LINE = /^ {2}"([^"]+)":/;

function annotationFor(key: string, value: unknown): string | null {
  const parts = [CLAIM_NAMES[key], TIME_CLAIMS.has(key) ? formatClaimTimeCompact(value) : null];
  const annotation = parts.filter(Boolean).join(" · ");
  return annotation || null;
}

/**
 * Claims serialized with the registered ones first. The ordering is applied by rebuilding
 * the top-level object, not through a JSON.stringify replacer array, which would also
 * filter the keys of every nested claim such as `address`.
 */
export function orderedJson(claims: Claims): string {
  const ordered = Object.fromEntries(orderClaims(Object.keys(claims)).map((key) => [key, claims[key]]));
  return JSON.stringify(ordered, null, 2);
}

/**
 * The decoded section as JSON with each registered claim explained on its own line.
 * Not valid JSON any more: it is read, not parsed. Copy actions use the plain form.
 */
export function annotate(claims: Claims): string {
  const lines = orderedJson(claims).split("\n");

  // Comments trail the value instead of lining up in a column: the block clips at the
  // panel edge, and a shared column would push every comment past it.
  return lines
    .map((line) => {
      const key = line.match(CLAIM_LINE)?.[1];
      const annotation = key ? annotationFor(key, claims[key]) : null;
      return annotation ? `${line} # ${annotation}` : line;
    })
    .join("\n");
}
