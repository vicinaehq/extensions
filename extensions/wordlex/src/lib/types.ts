/**
 * TypeScript interfaces mirroring the Rust models in the WordLex desktop app.
 * These are the exact shapes returned by `wordlex --cli-json` and `--search-json`.
 */

/** A single word sense — one meaning within a synset. */
export interface WordSense {
  synset_id: number;
  /** Part of speech code: "n", "v", "a", "r", "s" */
  pos: string;
  definition: string;
  synonyms: string[];
  antonyms: string[];
  examples: string[];
  /** Ordering within the synset (lower = more common) */
  sense_num: number;
}

/** Full detail for a looked-up word. */
export interface WordDetail {
  word: string;
  pronunciation: string | null;
  senses: WordSense[];
  /** "Type of" relationships */
  hypernyms: string[];
  /** "Types" relationships */
  hyponyms: string[];
  /** "Parts" relationships */
  meronyms: string[];
  /** "Part of" relationships */
  holonyms: string[];
  /** Words derived from this word */
  derived_forms: string[];
}

/** Lightweight search result for the type-ahead list. */
export interface SearchResult {
  word: string;
  /** All POS codes this word appears as */
  pos_list: string[];
  /** First definition only */
  short_def: string;
}

/** POS code → display label mapping */
export const POS_LABELS: Record<string, string> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  s: "adjective",
  r: "adverb",
};
