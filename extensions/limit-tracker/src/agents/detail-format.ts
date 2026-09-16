export function generateAsciiBar(percent: number, width = 12): string {
  const p = Math.max(0, Math.min(100, percent));
  const filled = Math.round((p / 100) * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

export function formatErrorMarkdown(message: string): string {
  return `### Message\n\n${message}`;
}

/**
 * Formats a remaining-second count as days/hours/minutes only (no seconds),
 * matching the "Resets In: 6d 18h" style.
 */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "now";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return minutes > 0 ? `${days}d ${hours}h ${minutes}m` : `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * One limit window (5h, weekly, per-model pool, ...) normalized so every
 * provider renders the same way through `LimitItems` (see limits.tsx).
 */
export interface LimitItem {
  /** Stable key for React lists. */
  id: string;
  /** Row title, e.g. "5h Limit" or "Anthropic — Weekly". */
  title: string;
  /** Percent remaining 0..100; null when the quota has no percentage. */
  percentRemaining: number | null;
  /** Absolute values appended after the percent, e.g. "420/500", "$1.20 / $5.00". */
  valueText?: string;
  /** Live countdown in seconds; takes precedence over resetsText. */
  resetsInSeconds?: number | null;
  /** Static reset text used when no live countdown exists. */
  resetsText?: string | null;
  /** Trailing status note, e.g. "exhausted". */
  note?: string;
  /** Indented sub-rows rendered under this limit (e.g. per-model usage). */
  subRows?: { title: string; text: string }[];
}

/** More than this many limit windows switches the detail to compact rows. */
export const COMPACT_LIMIT_THRESHOLD = 3;

export function isCompactLimitList(items: readonly LimitItem[]): boolean {
  return items.length > COMPACT_LIMIT_THRESHOLD;
}

/** "71" or "45.3" — integers stay whole, decimals get one trimmed place. */
function formatPercentNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

/** "▰▰▰▱ 71% remaining · 420/500 · exhausted" */
export function limitItemText(item: LimitItem): string {
  const parts: string[] = [];
  if (item.percentRemaining !== null) {
    parts.push(`${generateAsciiBar(item.percentRemaining)} ${formatPercentNumber(item.percentRemaining)}% remaining`);
  } else {
    parts.push(item.valueText ?? "N/A");
  }
  if (item.percentRemaining !== null && item.valueText) parts.push(item.valueText);
  if (item.note) parts.push(item.note);
  return parts.join(" · ");
}

/**
 * Reset annotation for a limit row. Live countdown seconds win; the static
 * resetsText is the fallback; null means no reset is known.
 */
export function limitResetText(
  item: Pick<LimitItem, "resetsInSeconds" | "resetsText">,
  liveSeconds?: number | null,
): string | null {
  const seconds = liveSeconds !== undefined ? liveSeconds : (item.resetsInSeconds ?? null);
  if (seconds !== null) return formatCountdown(seconds);
  return item.resetsText ?? null;
}

/**
 * Text-export mirror of the standard layout: one block per window,
 * "Title: bar N% remaining" followed by "Resets In: ..." when known.
 */
export function formatLimitsText(items: readonly LimitItem[]): string {
  return items
    .map((item) => {
      let text = `\n\n${item.title}: ${limitItemText(item)}`;
      const reset = limitResetText(item);
      if (reset) text += `\nResets In: ${reset}`;
      return text;
    })
    .join("");
}
