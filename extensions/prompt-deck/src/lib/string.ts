/**
 * Converts optional runtime values into safe strings before trimming or rendering.
 */
export function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Trims optional runtime values without throwing when Vicinae omits an empty form field.
 */
export function trimText(value: unknown): string {
  return toText(value).trim();
}

/**
 * Builds a lower-cased search string from optional runtime values.
 */
export function searchText(value: unknown): string {
  return trimText(value).toLowerCase();
}

/**
 * Collapses whitespace and truncates to at most maxLength characters,
 * for list rows and other single-line summaries.
 */
export function preview(text: string, maxLength = 90): string {
  const normalized = toText(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
