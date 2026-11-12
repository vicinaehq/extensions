import { hasLikelySecret } from "./privacy";
import type { MatchRange } from "./rank";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const PREVIEW_LIMIT = 220;

function escapeText(text: string): string {
  return text.replace(/[&<>"' ]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", " ": "&nbsp;",
  })[char]!);
}

/** Vicinae 0.30's Qt AutoText title renderer; never pass raw history markup. */
export function styledCommandTitle(command: string, ranges: readonly MatchRange[] = []): string {
  if (hasLikelySecret(command)) return "Sensitive command — review to reveal";
  // Force AutoText to decode entities even without highlighted characters.
  let title = "<b></b>";
  let highlighted = false;
  let length = 0;
  let rangeIndex = 0;
  for (const { segment, index } of segmenter.segment(command)) {
    const visible = segment.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,
      char => char === "\n" ? " ↵ " : char === "\t" ? " ⇥ " : "�");
    // Never split a combining sequence, emoji, escaped entity or formatting tag.
    if (length + visible.length > PREVIEW_LIMIT) {
      if (highlighted) title += "</u></b>";
      return title + "…";
    }
    while (rangeIndex < ranges.length && ranges[rangeIndex].end <= index) rangeIndex++;
    const range = ranges[rangeIndex];
    const matched = !!range && range.start < index + segment.length && range.end > index;
    if (matched !== highlighted) title += matched ? "<b><u>" : "</u></b>";
    title += escapeText(visible);
    highlighted = matched;
    length += visible.length;
  }
  return title + (highlighted ? "</u></b>" : "");
}
