/**
 * Parser for Valve's text KeyValues format ("VDF"), used by Steam for
 * appmanifest_*.acf, libraryfolders.vdf, localconfig.vdf, loginusers.vdf, etc.
 *
 * Supported syntax:
 *   - quoted and unquoted tokens, with \" \\ \n \t escapes inside quotes
 *   - nested objects with { }
 *   - // line comments
 *   - conditional suffixes like [$WIN32] (ignored, the pair is kept)
 *
 * Duplicate keys: later scalar values win; duplicate objects are merged.
 */

export type VdfValue = string | VdfObject;
export interface VdfObject {
  [key: string]: VdfValue;
}

export class VdfSyntaxError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = "VdfSyntaxError";
  }
}

type Token = { kind: "string"; value: string; offset: number } | { kind: "open" | "close"; offset: number };

const enum Ch {
  Tab = 9,
  LineFeed = 10,
  VerticalTab = 11,
  FormFeed = 12,
  CarriageReturn = 13,
  Space = 32,
  Quote = 34,
  Slash = 47,
  OpenBracket = 91,
  Backslash = 92,
  OpenBrace = 123,
  CloseBrace = 125,
  NoBreakSpace = 160,
  Bom = 0xfeff,
}

function isSpace(c: number): boolean {
  return c === Ch.Space || (c >= Ch.Tab && c <= Ch.CarriageReturn) || c === Ch.NoBreakSpace || c === Ch.Bom;
}

const UNESCAPE: Record<string, string> = { n: "\n", t: "\t", r: "\r" };

/**
 * Tokenizer tuned for multi-MB files (localconfig.vdf): char codes instead of
 * regexes, and quoted strings without escapes are sliced in one go.
 */
function* tokenize(input: string): Generator<Token> {
  let i = 0;
  const n = input.length;
  // Position of the next backslash at or after i; only ever moves forward, so finding it is O(n) overall.
  let nextBackslash = input.indexOf("\\");
  const backslashFrom = (from: number) => {
    if (nextBackslash !== -1 && nextBackslash < from) nextBackslash = input.indexOf("\\", from);
    return nextBackslash;
  };

  while (i < n) {
    const c = input.charCodeAt(i);
    if (isSpace(c)) {
      i++;
      continue;
    }
    if (c === Ch.Slash && input.charCodeAt(i + 1) === Ch.Slash) {
      const eol = input.indexOf("\n", i);
      i = eol === -1 ? n : eol;
      continue;
    }
    if (c === Ch.OpenBrace) {
      yield { kind: "open", offset: i++ };
      continue;
    }
    if (c === Ch.CloseBrace) {
      yield { kind: "close", offset: i++ };
      continue;
    }
    if (c === Ch.OpenBracket) {
      // Conditional like [$WIN32] or [!$X360]: skip it entirely.
      const end = input.indexOf("]", i);
      if (end === -1) throw new VdfSyntaxError("Unterminated conditional", i);
      i = end + 1;
      continue;
    }
    if (c === Ch.Quote) {
      const start = i;
      const close = input.indexOf('"', i + 1);
      const bs = backslashFrom(i + 1);
      if (close !== -1 && (bs === -1 || bs > close)) {
        // Fast path: no escapes inside.
        yield { kind: "string", value: input.slice(i + 1, close), offset: start };
        i = close + 1;
        continue;
      }
      // Slow path: unescape, collecting slices between escapes.
      const parts: string[] = [];
      let j = i + 1;
      let segment = j;
      while (true) {
        if (j >= n) throw new VdfSyntaxError("Unterminated string", start);
        const cc = input.charCodeAt(j);
        if (cc === Ch.Quote) {
          parts.push(input.slice(segment, j));
          j++;
          break;
        }
        if (cc === Ch.Backslash && j + 1 < n) {
          parts.push(input.slice(segment, j));
          const next = input[j + 1]!;
          parts.push(UNESCAPE[next] ?? next);
          j += 2;
          segment = j;
          continue;
        }
        j++;
      }
      yield { kind: "string", value: parts.join(""), offset: start };
      i = j;
      continue;
    }
    // Unquoted token: runs until whitespace or a structural character.
    const start = i;
    while (i < n) {
      const cc = input.charCodeAt(i);
      if (isSpace(cc) || cc === Ch.OpenBrace || cc === Ch.CloseBrace || cc === Ch.Quote) break;
      i++;
    }
    yield { kind: "string", value: input.slice(start, i), offset: start };
  }
}

export function parseVdf(input: string): VdfObject {
  const root: VdfObject = {};
  const stack: VdfObject[] = [root];
  let pendingKey: { value: string; offset: number } | null = null;

  for (const tok of tokenize(input)) {
    const current = stack[stack.length - 1]!;
    if (tok.kind === "string") {
      if (pendingKey === null) {
        pendingKey = { value: tok.value, offset: tok.offset };
      } else {
        current[pendingKey.value] = tok.value;
        pendingKey = null;
      }
    } else if (tok.kind === "open") {
      if (pendingKey === null) throw new VdfSyntaxError("Object without a key", tok.offset);
      const existing = current[pendingKey.value];
      const obj: VdfObject = typeof existing === "object" ? existing : {};
      current[pendingKey.value] = obj;
      stack.push(obj);
      pendingKey = null;
    } else {
      if (pendingKey !== null) throw new VdfSyntaxError(`Key "${pendingKey.value}" has no value`, pendingKey.offset);
      if (stack.length === 1) throw new VdfSyntaxError("Unbalanced closing brace", tok.offset);
      stack.pop();
    }
  }

  if (pendingKey !== null) throw new VdfSyntaxError(`Key "${pendingKey.value}" has no value`, pendingKey.offset);
  if (stack.length !== 1) throw new VdfSyntaxError("Unexpected end of input (unclosed object)", input.length);
  return root;
}

/** Case-insensitive key lookup. Steam is inconsistent about key casing ("apps" vs "Apps"). */
export function getKey(obj: VdfObject | undefined, key: string): VdfValue | undefined {
  if (!obj) return undefined;
  if (key in obj) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

/** Walk a path of keys case-insensitively, returning the object at the end (or undefined). */
export function getObject(obj: VdfObject | undefined, ...path: string[]): VdfObject | undefined {
  let cur: VdfValue | undefined = obj;
  for (const key of path) {
    if (typeof cur !== "object") return undefined;
    cur = getKey(cur, key);
  }
  return typeof cur === "object" ? cur : undefined;
}

export function getString(obj: VdfObject | undefined, key: string): string | undefined {
  const v = getKey(obj, key);
  return typeof v === "string" ? v : undefined;
}

export function getNumber(obj: VdfObject | undefined, key: string): number | undefined {
  const s = getString(obj, key);
  if (s === undefined || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
