import * as chrono from "chrono-node";
import { addMinutes } from "./date-utils";

/**
 * Pure chrono-node helper for the Create Quick Event command.
 *
 * This module MUST NOT import `@vicinae/api` so it stays unit-testable
 * under plain tsx. It only parses text into a preview; the actual event
 * creation goes through Google's `events.quickAdd` endpoint, which does
 * its own (server-side) natural-language interpretation.
 */

export type QuickEventConfidence = "high" | "medium" | "none";

export interface QuickEventPreview {
  /** Best-effort title with the parsed date/time (and duration) words removed. */
  title: string;
  /** Parsed start, or undefined when the text contains no recognizable date. */
  start: Date | undefined;
  /** Parsed end, or start + duration when the text has no explicit end. */
  end: Date | undefined;
  /** True when the text pins a time of day (not just a bare date). */
  hasTime: boolean;
  /** "none" when nothing date-like was found. */
  confidence: QuickEventConfidence;
}

const DURATION_RE = /\bfor\s+(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h)\b/i;
const DANGLING_PREPOSITION_RE = /\s+(at|on|for|from|by|with|during)\s*$/i;
const EDGE_PUNCTUATION_RE = /^[\s,;:\-–—]+|[\s,;:\-–—]+$/g;

function durationMinutesFromText(text: string, fallback: number): number {
  const match = text.match(DURATION_RE);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const unit = match[2].toLowerCase();
  const minutes = unit.startsWith("h") ? amount * 60 : amount;
  return Math.floor(minutes) > 0 ? Math.floor(minutes) : fallback;
}

/** Remove the parsed date substring + duration phrase so a title remains. */
function stripToTitle(input: string, parsedText: string | undefined): string {
  let title = input;
  if (parsedText) {
    const idx = input.toLowerCase().lastIndexOf(parsedText.toLowerCase());
    if (idx >= 0) {
      title = `${input.slice(0, idx)} ${input.slice(idx + parsedText.length)}`;
    }
  }
  title = title.replace(DURATION_RE, " ");
  title = title.replace(/\s+/g, " ").replace(EDGE_PUNCTUATION_RE, "").trim();
  title = title.replace(DANGLING_PREPOSITION_RE, "").trim();
  return title.length > 0 ? title : input.trim();
}

/**
 * Parse natural-language event text into a preview.
 *
 * Never throws for ordinary input: unparseable text yields a "none"
 * confidence preview whose title is the raw text, letting Google decide.
 */
export function parseQuickEventText(
  text: string,
  now?: Date,
  minDuration = 30,
): QuickEventPreview | undefined {
  if (typeof text !== "string") return undefined;
  const input = text.trim();
  if (input.length === 0) return undefined;

  const reference = now ?? new Date();
  const fallbackDuration =
    Number.isFinite(minDuration) && minDuration > 0 ? Math.floor(minDuration) : 30;

  let results: chrono.ParsedResult[] = [];
  try {
    results = chrono.parse(input, reference, { forwardDate: true });
  } catch {
    results = [];
  }

  if (results.length === 0) {
    return { title: input, start: undefined, end: undefined, hasTime: false, confidence: "none" };
  }

  const first = results[0];
  const start = first.start.date();
  const durationMin = durationMinutesFromText(input, fallbackDuration);
  let end: Date | undefined;
  try {
    end = first.end ? first.end.date() : addMinutes(start, durationMin);
  } catch {
    end = addMinutes(start, durationMin);
  }

  let hasTime = false;
  try {
    hasTime = first.start.isCertain("hour");
  } catch {
    hasTime = false;
  }

  return {
    title: stripToTitle(input, first.text),
    start,
    end,
    hasTime,
    confidence: hasTime ? "high" : "medium",
  };
}
