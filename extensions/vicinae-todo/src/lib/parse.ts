import * as chrono from "chrono-node";
import { toIsoDate } from "./store";

export interface ParsedTodo {
  title: string;
  due?: string;
}

/**
 * Parse a quick-add string like "buy milk tomorrow" into a title and a
 * due date. The date phrase is stripped from the title. Deterministic,
 * no network.
 */
export function parseQuickAdd(input: string, reference: Date = new Date()): ParsedTodo {
  const text = input.trim();
  if (!text) return { title: "" };

  const results = chrono.parse(text, reference, { forwardDate: true });
  if (results.length === 0) return { title: text };

  const match = results[0];
  // Drop a connector word ("pay rent *on* jun 20") left dangling once the
  // date phrase is removed.
  const prefix = text
    .slice(0, match.index)
    .replace(/\b(on|at|by|due|for)\s*$/i, "");
  const title = (prefix + text.slice(match.index + match.text.length))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();

  // If stripping the date leaves nothing, the whole input was a date
  // phrase — treat it as a plain title instead.
  if (!title) return { title: text };

  return { title, due: toIsoDate(match.start.date()) };
}
