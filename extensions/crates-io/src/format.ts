/**
 * Date formatting for the detail panel.
 *
 * Single helper keeps `toLocaleDateString` options consistent; invalid input
 * renders as empty so callers can conditionally show rows.
 */

/** Localized date (`Jul 18, 2026`); empty for missing or invalid input. */
export function formatDate(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
