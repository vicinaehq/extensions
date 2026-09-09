import * as chrono from "chrono-node";
import { toIsoDate } from "./store";

export interface ParsedTodo {
  title: string;
  due?: string;
  /** HH:MM, 24h — local-only, Google Tasks cannot store a time of day */
  dueTime?: string;
}

/** "1200hrs", "1200 hrs", "12:00hrs", "0930 hours" → "12:00", "09:30" */
function normalizeSuffixedMilitary(text: string): string {
  return text.replace(/\b(\d{1,2})[:.]?([0-5]\d)\s*(?:hrs?|hours)\b/gi, (match, h, mm) =>
    Number(h) <= 23 ? `${h}:${mm}` : match,
  );
}

/**
 * Valid bare 4-digit time, excluding 19xx/20xx which read as years
 * ("jun 22 2027") — use an hrs suffix or a colon for 19:30 / 20:30.
 */
function isBareTime(h: string): boolean {
  return Number(h) <= 23 && h !== "19" && h !== "20";
}

/**
 * Convert a bare "1500" to "15:00", but only when its position says
 * "time" rather than "quantity": directly before the date phrase
 * ("1500 tomorrow"), directly after it, optionally via "at" or a comma
 * ("tomorrow 1500", "tomorrow at 1500"), or at the very end of the input.
 * "buy 1500 nails tomorrow" and "pay 1200 by jun 20" stay untouched.
 * Returns null when no qualifying token exists.
 */
function convertAdjacentBareTime(text: string, dateFrom: number, dateTo: number): string | null {
  const before = text.slice(0, dateFrom);
  const after = text.slice(dateTo);

  let m = before.match(/\b([012]\d)([0-5]\d)\s+$/);
  if (m && isBareTime(m[1])) {
    return before.slice(0, m.index) + `${m[1]}:${m[2]} ` + text.slice(dateFrom);
  }

  m = after.match(/^([,\s]*(?:at\s+)?)([012]\d)([0-5]\d)\b/);
  if (m && isBareTime(m[2])) {
    return text.slice(0, dateTo) + m[1] + `${m[2]}:${m[3]}` + after.slice(m[0].length);
  }

  m = text.match(/\b([012]\d)([0-5]\d)\s*[.!?]?\s*$/);
  if (m && isBareTime(m[1])) {
    return text.slice(0, m.index) + `${m[1]}:${m[2]}` + text.slice(m.index! + m[1].length + m[2].length);
  }

  return null;
}

/**
 * Parse a quick-add string like "MTP submission due on 22nd june 12pm"
 * into a title, a due date and an optional time. Date/time phrases are
 * stripped from the title. Deterministic, no network.
 */
export function parseQuickAdd(input: string, reference: Date = new Date()): ParsedTodo {
  const original = input.trim();
  if (!original) return { title: "" };

  let text = normalizeSuffixedMilitary(original);
  let results = chrono.parse(text, reference, { forwardDate: true });

  // Bare military numbers are too ambiguous on their own ("buy 1500 nails"),
  // so only try them when a date phrase was found without an explicit time,
  // and only in positions where a time would naturally sit.
  if (results.length > 0 && !results.some((r) => r.start.isCertain("hour"))) {
    const dateMatch = results.find((r) => r.start.isCertain("day")) ?? results[0];
    const retry = convertAdjacentBareTime(text, dateMatch.index, dateMatch.index + dateMatch.text.length);
    if (retry) {
      const retried = chrono.parse(retry, reference, { forwardDate: true });
      if (retried.some((r) => r.start.isCertain("hour"))) {
        text = retry;
        results = retried;
      }
    }
  }

  if (results.length === 0) return { title: original };

  // Date from the first match that pins down a day, time from the first
  // that pins down an hour — usually the same match, but "submit 1200
  // tomorrow" can come back as two.
  const dateResult = results.find((r) => r.start.isCertain("day")) ?? results[0];
  const timeResult = results.find((r) => r.start.isCertain("hour"));
  let dueTime: string | undefined;
  if (timeResult) {
    const h = String(timeResult.start.get("hour") ?? 0).padStart(2, "0");
    const m = String(timeResult.start.get("minute") ?? 0).padStart(2, "0");
    dueTime = `${h}:${m}`;
  }

  let title = text;
  const ranges = [...new Set(results)]
    .map((r) => ({ from: r.index, to: r.index + r.text.length }))
    .sort((a, b) => b.from - a.from);
  for (const { from, to } of ranges) {
    // Drop connector words ("due on jun 22") left dangling once the date
    // phrase is removed.
    const prefix = title.slice(0, from).replace(/(?:\b(?:on|at|by|due|for)\s*)+$/i, "");
    title = prefix + title.slice(to);
  }
  title = title.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();

  // If stripping leaves nothing, the whole input was a date phrase —
  // treat it as a plain title instead.
  if (!title) return { title: original };

  return { title, due: toIsoDate(dateResult.start.date()), dueTime };
}
