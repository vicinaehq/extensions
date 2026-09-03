import { MAX_COUNT, type Kind } from "./generator";

export type ParseCountResult = { ok: true; value: number } | { ok: false; message: string };

export interface ParsedQuery {
  count?: number;
  kind?: Kind;
  characters?: boolean;
}

const KINDS: Kind[] = ["paragraphs", "sentences", "words", "titles", "list", "html"];

export function isKind(value: string): value is Kind {
  return (KINDS as string[]).includes(value);
}

export function parseCount(
  raw: string | undefined,
  fallback = 1,
): ParseCountResult {
  if (raw == null || raw.trim() === "") {
    return { ok: true, value: fallback };
  }

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, message: "Enter a whole number of at least 1." };
  }

  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) {
    return { ok: false, message: "Enter a whole number of at least 1." };
  }
  if (n > MAX_COUNT) {
    return { ok: false, message: `Keep the count at ${MAX_COUNT} or below.` };
  }
  return { ok: true, value: n };
}

const QUERY_RE =
  /^(\d+)\s*(paragraphs?|para|sentences?|sent|words?|titles?|items?|list|html|characters?|chars?|p|s|w|t|l|h|c)?$/i;

export function parseQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  if (!trimmed) return {};

  const match = QUERY_RE.exec(trimmed);
  if (!match) return {};

  const count = Number(match[1]);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) return {};

  const suffix = match[2]?.toLowerCase();
  if (!suffix) return { count };

  if (suffix === "c" || suffix.startsWith("char")) {
    return { count, characters: true };
  }

  const key = suffix[0];
  let kind: Kind | undefined;
  if (key === "p") kind = "paragraphs";
  else if (key === "s") kind = "sentences";
  else if (key === "w") kind = "words";
  else if (key === "t") kind = "titles";
  else if (key === "l" || key === "i") kind = "list";
  else if (key === "h") kind = "html";

  return kind ? { count, kind } : { count };
}

/** Keep the number from a parsed query so a dropdown change can replace the suffix. */
export function stripKindSuffix(query: string): string {
  const parsed = parseQuery(query);
  return parsed.count != null ? String(parsed.count) : query;
}
