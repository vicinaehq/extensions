/**
 * Helpers for the comma separated tag strings buku reads and writes.
 * buku lowercases every tag it stores, so we normalize the same way before
 * comparing or sending tags back.
 */

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/** Normalizes tags, dropping empty ones and duplicates while keeping the original order. */
export function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();

  return tags.reduce<string[]>((kept, raw) => {
    const tag = normalizeTag(raw);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      kept.push(tag);
    }
    return kept;
  }, []);
}

/** `"dev, tools"` -> `["dev", "tools"]` */
export function splitTags(value: string | null | undefined): string[] {
  return uniqueTags((value ?? "").split(","));
}

/** `["dev", "tools"]` -> `"dev, tools"` */
export function joinTags(tags: string[]): string {
  return tags.join(", ");
}

/**
 * Parses `buku -t` output, whose lines look like `   15. dev (22)`.
 * Only numbered lines count, so notices buku may print alongside the listing — such as
 * the one about creating the database — are not mistaken for tags.
 */
const TAG_LINE = /^\s*\d+\.\s+(.+?)(?:\s*\(\d+\))?\s*$/;

export function parseTagListing(stdout: string): string[] {
  return uniqueTags(stdout.split("\n").map((line) => TAG_LINE.exec(line)?.[1] ?? ""));
}
