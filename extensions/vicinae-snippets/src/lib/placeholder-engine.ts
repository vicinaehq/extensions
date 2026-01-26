import crypto from "node:crypto";

import { ArgumentSpec } from "./snippet-model";

async function readClipboardText(): Promise<string | undefined> {
  const { Clipboard } = await import("@vicinae/api");
  return await Clipboard.readText();
}

async function readSelectedText(): Promise<string> {
  const { getSelectedText } = await import("@vicinae/api");
  return await getSelectedText();
}

export type PlaceholderNoticeKind =
  | "clipboard_empty"
  | "selection_empty"
  | "cursor_ignored"
  | "unsupported_placeholder"
  | "unsupported_modifier"
  | "too_many_arguments";

export interface PlaceholderNotice {
  kind: PlaceholderNoticeKind;
  message: string;
}

export interface RenderResult {
  text: string;
  notices: PlaceholderNotice[];
}

type PlaceholderParams = Record<string, string>;

function splitModifiers(body: string): { base: string; modifiers: string[] } {
  const parts = body.split("|").map((p) => p.trim()).filter(Boolean);
  const [base, ...mods] = parts;
  return { base: base ?? "", modifiers: mods };
}

function parseBase(base: string): { name: string; params: PlaceholderParams } {
  const trimmed = base.trim();
  if (!trimmed) return { name: "", params: {} };

  const firstSpace = trimmed.search(/\s/);
  const name = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).trim();
  const rest = (firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1)).trim();

  const params: PlaceholderParams = {};
  if (!rest) return { name, params };

  // Parse k="v" and k=v (no spaces)
  const re = /([a-zA-Z0-9_-]+)\s*=\s*(\"[^\"]*\"|[^\s]+)/g;
  for (const m of rest.matchAll(re)) {
    const key = m[1];
    let value = m[2] ?? "";
    if (value.startsWith("\"") && value.endsWith("\"")) value = value.slice(1, -1);
    params[key] = value;
  }
  return { name, params };
}

function applyModifiers(value: string, modifiers: string[], notices: PlaceholderNotice[]): string {
  let v = value;
  for (const mod of modifiers) {
    const m = mod.trim();
    if (!m) continue;

    switch (m) {
      case "raw":
        // Vicinae snippets don't apply default formatting; keep `raw` as a no-op.
        break;
      case "trim":
        v = v.trim();
        break;
      case "uppercase":
        v = v.toUpperCase();
        break;
      case "lowercase":
        v = v.toLowerCase();
        break;
      case "percent-encode":
        v = encodeURIComponent(v);
        break;
      case "json-stringify":
        v = JSON.stringify(v);
        break;
      default:
        notices.push({
          kind: "unsupported_modifier",
          message: `Unsupported modifier: ${m}`,
        });
        break;
    }
  }
  return v;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function applyOffset(date: Date, offsetRaw?: string): Date {
  if (!offsetRaw) return date;
  const tokens = offsetRaw.trim().split(/\s+/).filter(Boolean);
  let d = new Date(date);

  for (const t of tokens) {
    const m = /^([+-])(\d+)([mhdMy])$/.exec(t);
    if (!m) continue;
    const sign = m[1] === "-" ? -1 : 1;
    const amount = sign * Number(m[2]);
    const unit = m[3];

    switch (unit) {
      case "m":
        d = new Date(d.getTime() + amount * 60_000);
        break;
      case "h":
        d = new Date(d.getTime() + amount * 3_600_000);
        break;
      case "d":
        d = new Date(d.getTime() + amount * 86_400_000);
        break;
      case "M":
        d.setMonth(d.getMonth() + amount);
        break;
      case "y":
        d.setFullYear(d.getFullYear() + amount);
        break;
    }
  }
  return d;
}

function ordinal(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function formatOffsetRfc822(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  // RFC 822 offset format does not use "Z"; it uses +0000.
  if (offsetMinutes === 0) return "+0000";
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return `${sign}${hh}${mm}`;
}

function formatOffsetIso8601(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  if (offsetMinutes === 0) return "Z";
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return `${sign}${hh}:${mm}`;
}

function formatToPartsSingle(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  partType: Intl.DateTimeFormatPartTypes,
): string | undefined {
  try {
    const parts = new Intl.DateTimeFormat(undefined, options).formatToParts(date);
    return parts.find((p) => p.type === partType)?.value;
  } catch {
    return undefined;
  }
}

function weekdayName(date: Date, style: "short" | "long" | "narrow"): string {
  return (
    formatToPartsSingle(date, { weekday: style }, "weekday") ??
    date.toLocaleDateString(undefined, { weekday: style })
  );
}

function monthName(date: Date, style: "short" | "long" | "narrow"): string {
  return (
    formatToPartsSingle(date, { month: style }, "month") ??
    date.toLocaleDateString(undefined, { month: style })
  );
}

function dayPeriod(date: Date): string {
  return (
    formatToPartsSingle(date, { hour: "numeric", hour12: true }, "dayPeriod") ??
    (date.getHours() < 12 ? "AM" : "PM")
  );
}

function timeZoneName(date: Date, style: "short" | "long"): string {
  // Depends on runtime/ICU data: may return an abbreviation (e.g. "IST") or a GMT offset fallback.
  return (
    formatToPartsSingle(date, { timeZoneName: style }, "timeZoneName") ??
    date.toLocaleTimeString(undefined, { timeZoneName: style }).split(" ").slice(-1)[0] ??
    ""
  );
}

function formatTr35Token(date: Date, token: string): string {
  const ch = token[0] ?? "";
  const len = token.length;
  const year = date.getFullYear();

  switch (ch) {
    case "y": {
      if (len === 1) return String(year);
      if (len === 2) return pad2(Math.abs(year) % 100);
      return String(year).padStart(Math.max(4, len), "0");
    }
    case "Q": {
      const q = Math.floor(date.getMonth() / 3) + 1;
      if (len === 1) return String(q);
      if (len === 2) return pad2(q);
      if (len === 3) return `Q${q}`;
      if (len === 4) return `${ordinal(q)} quarter`;
      return String(q);
    }
    case "M": {
      const m = date.getMonth() + 1;
      if (len === 1) return String(m);
      if (len === 2) return pad2(m);
      if (len === 3) return monthName(date, "short");
      if (len === 4) return monthName(date, "long");
      if (len >= 5) return monthName(date, "narrow");
      return String(m);
    }
    case "d": {
      const d = date.getDate();
      if (len === 1) return String(d);
      if (len === 2) return pad2(d);
      return String(d).padStart(len, "0");
    }
    case "F": {
      // Day of week in month (numeric): e.g. 2022-06-15 is the 3rd Wednesday => 3
      return String(Math.floor((date.getDate() - 1) / 7) + 1);
    }
    case "E": {
      if (len === 1 || len === 2 || len === 3) return weekdayName(date, "short");
      if (len === 4) return weekdayName(date, "long");
      if (len === 5) return weekdayName(date, "narrow");
      if (len === 6) {
        const short = weekdayName(date, "short");
        return Array.from(short).slice(0, 2).join("");
      }
      return weekdayName(date, "short");
    }
    case "h": {
      const raw = date.getHours() % 12;
      const h = raw === 0 ? 12 : raw;
      if (len === 1) return String(h);
      if (len === 2) return pad2(h);
      return String(h).padStart(len, "0");
    }
    case "H": {
      const h = date.getHours();
      if (len === 1) return String(h);
      if (len === 2) return pad2(h);
      return String(h).padStart(len, "0");
    }
    case "a":
      return dayPeriod(date);
    case "m": {
      const m = date.getMinutes();
      if (len === 1) return String(m);
      if (len === 2) return pad2(m);
      return String(m).padStart(len, "0");
    }
    case "s": {
      const s = date.getSeconds();
      if (len === 1) return String(s);
      if (len === 2) return pad2(s);
      return String(s).padStart(len, "0");
    }
    case "S": {
      const ms = date.getMilliseconds();
      const frac = pad3(ms); // milliseconds as 3 digits
      // TR35: fractional seconds; truncate or pad with zeros as needed.
      if (len <= 3) return frac.slice(0, len);
      return frac + "0".repeat(len - 3);
    }
    case "z": {
      // zzz / zzzz
      if (len >= 4) return timeZoneName(date, "long") || `GMT${formatOffsetIso8601(date)}`;
      return timeZoneName(date, "short") || `GMT${formatOffsetIso8601(date)}`;
    }
    case "O": {
      // Localized GMT format (approximation).
      // - O: short (e.g. GMT+8, GMT-3)
      // - OOOO: long (e.g. GMT+08:00)
      const offsetMinutes = -date.getTimezoneOffset();
      if (offsetMinutes === 0) return "GMT";
      const sign = offsetMinutes >= 0 ? "+" : "-";
      const abs = Math.abs(offsetMinutes);
      const hh = pad2(Math.floor(abs / 60));
      const mm = pad2(abs % 60);
      if (len >= 4) return `GMT${sign}${hh}:${mm}`;
      const hShort = String(Number(hh)); // drop leading zero
      return mm === "00" ? `GMT${sign}${hShort}` : `GMT${sign}${hShort}:${mm}`;
    }
    case "Z": {
      // TR35:
      // - Z / ZZ / ZZZ: RFC 822 offset (e.g. -0800)
      // - ZZZZ: localized GMT format (e.g. GMT-08:00)
      // - ZZZZZ: ISO 8601 extended format (e.g. -08:00 / Z)
      if (len <= 3) return formatOffsetRfc822(date);
      if (len === 5) return formatOffsetIso8601(date);
      const off = formatOffsetIso8601(date);
      return off === "Z" ? "GMT" : `GMT${off}`;
    }
    case "X":
    case "x": {
      // ISO 8601 time zone formats (approximation; seconds offsets are ignored).
      //
      // X: "Z" for zero offset
      // x: "+00" / "+0000" / "+00:00" for zero offset (no "Z")
      const offsetMinutes = -date.getTimezoneOffset();
      const sign = offsetMinutes >= 0 ? "+" : "-";
      const abs = Math.abs(offsetMinutes);
      const hh = pad2(Math.floor(abs / 60));
      const mm = pad2(abs % 60);

      const isZero = abs === 0;
      const zeroAsZ = ch === "X";
      if (isZero) {
        if (zeroAsZ) return "Z";
        if (len === 1) return "+00";
        if (len === 2 || len === 4) return "+0000";
        return "+00:00"; // len 3 or 5+
      }

      if (len === 1) {
        // Minutes are optional when they are 00.
        return mm === "00" ? `${sign}${hh}` : `${sign}${hh}${mm}`;
      }
      if (len === 2 || len === 4) return `${sign}${hh}${mm}`;
      // len 3 or 5+
      return `${sign}${hh}:${mm}`;
    }
    default:
      // Unhandled TR35 letters: output as-is to avoid silently "inventing" formats.
      return token;
  }
}

function formatWithPattern(date: Date, pattern: string): string {
  // A Raycast-aligned subset of Unicode TR35 date patterns.
  // - Single-quote literals: e.g. `yyyy-MM-dd'T'HH:mm:ssZ`
  // - `''` represents a literal `'`
  let out = "";
  let inQuote = false;
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i] ?? "";

    if (ch === "'") {
      const next = pattern[i + 1];
      if (next === "'") {
        out += "'";
        i += 2;
        continue;
      }
      inQuote = !inQuote;
      i += 1;
      continue;
    }

    if (inQuote) {
      out += ch;
      i += 1;
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < pattern.length && pattern[j] === ch) j += 1;
      out += formatTr35Token(date, pattern.slice(i, j));
      i = j;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function formatDateLike(kind: "date" | "time" | "datetime" | "day", params: PlaceholderParams): string {
  const base = applyOffset(new Date(), params.offset);
  if (params.format) return formatWithPattern(base, params.format);

  switch (kind) {
    case "date":
      return base.toLocaleDateString();
    case "time":
      return base.toLocaleTimeString();
    case "datetime":
      return base.toLocaleString();
    case "day":
      return base.toLocaleDateString(undefined, { weekday: "long" });
  }
}

export function extractArguments(template: string): { specs: ArgumentSpec[]; notices: PlaceholderNotice[] } {
  const notices: PlaceholderNotice[] = [];
  const specs: ArgumentSpec[] = [];
  const seenNamed = new Set<string>();
  let unnamedCount = 0;

  const re = /\{([^{}]+)\}/g;
  for (const m of template.matchAll(re)) {
    const body = m[1] ?? "";
    const { base } = splitModifiers(body);
    const { name, params } = parseBase(base);
    if (name !== "argument") continue;

    const named = params.name?.trim();
    if (named) {
      if (!seenNamed.has(named)) {
        seenNamed.add(named);
        specs.push({
          key: named,
          name: named,
          defaultValue: params.default,
          options: params.options ? params.options.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          required: params.default === undefined,
        });
      }
    } else {
      unnamedCount += 1;
      const key = `arg${unnamedCount}`;
      specs.push({
        key,
        defaultValue: params.default,
        options: params.options ? params.options.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        required: params.default === undefined,
      });
    }
  }

  const uniqueKeys = Array.from(new Set(specs.map((s) => s.key)));
  if (uniqueKeys.length > 3) {
    const keysPreview = uniqueKeys.slice(0, 8).join(", ");
    notices.push({
      kind: "too_many_arguments",
      message:
        `A snippet supports up to 3 distinct {argument} placeholders; found ${uniqueKeys.length} (${keysPreview}${
          uniqueKeys.length > 8 ? ", …" : ""
        }). Reduce the number of arguments or reuse a named argument via {argument name="..."}.`,
    });
  }

  // Preserve order and dedupe (named arguments may appear multiple times).
  const out: ArgumentSpec[] = [];
  const seen = new Set<string>();
  for (const s of specs) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
  }

  return { specs: out.slice(0, 3), notices };
}

export async function renderTemplate(
  template: string,
  args: Record<string, string | undefined>,
): Promise<RenderResult> {
  const notices: PlaceholderNotice[] = [];

  const { notices: argNotices } = extractArguments(template);
  notices.push(...argNotices);
  if (argNotices.some((n) => n.kind === "too_many_arguments")) {
    // Fail fast to avoid producing an unpredictable insertion result.
    return { text: template, notices };
  }

  let unnamedCounter = 0;
  let cursorSeen = false;

  const re = /\{([^{}]+)\}/g;
  let out = "";
  let last = 0;

  for (const m of template.matchAll(re)) {
    const idx = m.index ?? 0;
    out += template.slice(last, idx);

    const whole = m[0] ?? "";
    const body = m[1] ?? "";
    const { base, modifiers } = splitModifiers(body);
    const { name, params } = parseBase(base);

    let value: string | undefined;

    try {
      switch (name) {
        case "clipboard": {
          const t = await readClipboardText();
          value = t;
          if (params.offset) {
            notices.push({
              kind: "unsupported_placeholder",
              message:
                "`{clipboard offset=...}` is not supported yet (Vicinae API offset is not implemented). Using the latest clipboard text.",
            });
          }
          if (!t) {
            notices.push({
              kind: "clipboard_empty",
              message: "No clipboard text found: replaced {clipboard} with an empty string.",
            });
          }
          break;
        }
        case "selection": {
          let t = "";
          try {
            t = await readSelectedText();
          } catch {
            t = "";
          }
          value = t;
          if (!t) {
            notices.push({
              kind: "selection_empty",
              message: "No selected text found: replaced {selection} with an empty string.",
            });
          }
          break;
        }
        case "uuid":
          value = crypto.randomUUID();
          break;
        case "date":
        case "time":
        case "datetime":
        case "day":
          value = formatDateLike(name, params);
          break;
        case "cursor": {
          // The current API doesn't guarantee cursor positioning after paste.
          if (!cursorSeen) {
            cursorSeen = true;
            notices.push({
              kind: "cursor_ignored",
              message: "`{cursor}` is not supported in this environment. Ignored.",
            });
          }
          value = "";
          break;
        }
        case "argument": {
          const named = params.name?.trim();
          let key: string;
          if (named) {
            key = named;
          } else {
            unnamedCounter += 1;
            key = `arg${unnamedCounter}`;
          }

          const provided = args[key];
          const fallback = params.default;
          const resolved = provided ?? fallback;
          value = resolved ?? "";
          break;
        }
        case "snippet":
          notices.push({
            kind: "unsupported_placeholder",
            message: "`{snippet name=\"...\"}` is not supported (kept as-is).",
          });
          value = undefined;
          break;
        case "browser-tab":
          notices.push({
            kind: "unsupported_placeholder",
            message: "`{browser-tab}` is not supported (kept as-is).",
          });
          value = undefined;
          break;
        default:
          // Important: don't treat every `{...}` as a placeholder. Many code snippets contain braces (JSON/JSX/etc).
          // Only replace placeholders we explicitly support; keep unknown content as-is without warning to reduce noise.
          value = undefined;
          break;
      }
    } catch {
      value = undefined;
    }

    if (value === undefined) {
      out += whole; // preserve
    } else {
      out += applyModifiers(String(value), modifiers, notices);
    }

    last = idx + whole.length;
  }

  out += template.slice(last);
  return { text: out, notices };
}
