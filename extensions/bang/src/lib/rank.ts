import type { HistoryEntry } from "./history";

/** Half-open UTF-16 offsets in the original, unmodified command. */
export type MatchRange = { start: number; end: number };
export type HistoryMatch = { item: HistoryEntry; ranges: MatchRange[] };

function indexCommand(command: string) {
  const text = command.toLowerCase();
  // Lowercasing can expand a character (İ → i + combining dot). Cache the
  // reverse map only when needed; keep whole-string contextual casing (Σ).
  let offsets: Uint32Array | undefined;
  if (text.length !== command.length) {
    offsets = new Uint32Array(text.length);
    let original = 0;
    let folded = 0;
    for (const char of command) {
      const length = char.toLowerCase().length;
      offsets.fill(original, folded, folded + length);
      original += char.length;
      folded += length;
    }
  }
  return { text, offsets };
}

function matchRanges(command: string, text: string, offsets: Uint32Array | undefined, query: string): MatchRange[] {
  const contiguous = text.indexOf(query);
  let next = contiguous >= 0 ? contiguous : 0;
  const ranges: MatchRange[] = [];
  for (const char of query) {
    const at = contiguous >= 0 ? next : text.indexOf(char, next);
    let start = offsets?.[at] ?? at;
    let last = offsets?.[at + char.length - 1] ?? at + char.length - 1;
    // A range always covers a whole code point, including astral characters.
    if (start > 0 && /[\udc00-\udfff]/.test(command[start])) start--;
    if (last > 0 && /[\udc00-\udfff]/.test(command[last])) last--;
    const end = last + (command.codePointAt(last)! > 0xffff ? 2 : 1);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end);
    else ranges.push({ start, end });
    next = at + char.length;
  }
  return ranges;
}

/** Cached once per snapshot. Subsequence search supports gaps such as `dck cmp`. */
export function createHistorySearchWithMatches(entries: HistoryEntry[]) {
  const indexed = entries.map((item, index) => ({ item, index, ...indexCommand(item.command) }));
  return (query: string, limit = 50): HistoryMatch[] => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, limit).map(item => ({ item, ranges: [] }));
    const matches: { item: HistoryEntry; score: number; index: number }[] = [];
    for (const { item, index, text } of indexed) {
      let pos = 0;
      let gaps = 0;
      let boundaries = 0;
      let found = true;
      for (const char of q) {
        const next = text.indexOf(char, pos);
        if (next < 0) { found = false; break; }
        if (pos > 0) gaps += next - pos;
        if (next === 0 || /[\s/_.-]/.test(text[next - 1])) boundaries++;
        pos = next + char.length;
      }
      if (!found) continue;
      const contiguous = text.indexOf(q);
      const quality = (contiguous === 0 ? 120 : contiguous >= 0 ? 90 : 50) + boundaries * 2 - Math.min(gaps, 100) * 0.3;
      const recency = 12 / (1 + index / 100);
      const frequency = Math.min(12, Math.log2(item.frequency ?? 1) * 3);
      matches.push({ item, index, score: quality + recency + frequency });
    }
    matches.sort((a, b) => b.score - a.score || a.index - b.index);
    // Only build ranges for visible results, not every matching history entry.
    return matches.slice(0, limit).map(({ item, index }) => ({
      item, ranges: matchRanges(item.command, indexed[index].text, indexed[index].offsets, q),
    }));
  };
}

export function createHistorySearch(entries: HistoryEntry[]) {
  const search = createHistorySearchWithMatches(entries);
  return (query: string, limit = 50): HistoryEntry[] => search(query, limit).map(match => match.item);
}

export function searchHistory(entries: HistoryEntry[], query: string, limit = 50): HistoryEntry[] {
  return createHistorySearch(entries)(query, limit);
}
