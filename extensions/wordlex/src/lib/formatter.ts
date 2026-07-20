/**
 * Converts a WordDetail object into formatted markdown for Vicinae's
 * Detail and List.Item.Detail components.
 *
 * The markdown renderer in Vicinae (native Qt) supports headings, bold,
 * italics, blockquotes, lists, and horizontal rules.
 */

import type { WordDetail } from "./types";
import { POS_LABELS } from "./types";

/**
 * Format the full word detail into a markdown string suitable for Vicinae's native renderer.
 */
export function formatWordDetailMarkdown(detail: WordDetail): string {
  const lines: string[] = [];

  // Title + pronunciation
  lines.push(`# ${detail.word}`);
  if (detail.pronunciation) {
    lines.push(`*/${detail.pronunciation}/*`);
  }
  lines.push("");

  // Group senses by POS
  const grouped = groupByPos(detail.senses);

  for (const [pos, senses] of grouped) {
    const label = POS_LABELS[pos] ?? pos;
    lines.push(`## ${capitalize(label)}`);

    for (const sense of senses) {
      lines.push(`${sense.sense_num}. ${sense.definition}`);

      if (sense.examples.length > 0) {
        lines.push(`   > "${sense.examples[0]}"`);
      }

      if (sense.synonyms.length > 0) {
        lines.push(`   - **Synonyms:** ${sense.synonyms.join(", ")}`);
      }

      if (sense.antonyms.length > 0) {
        lines.push(`   - **Antonyms:** ${sense.antonyms.join(", ")}`);
      }

      lines.push("");
    }
  }

  // Relations section
  const relations: string[] = [];
  if (detail.hypernyms.length > 0) {
    relations.push(`- **Type of:** ${detail.hypernyms.join(", ")}`);
  }
  if (detail.hyponyms.length > 0) {
    relations.push(`- **Types:** ${detail.hyponyms.join(", ")}`);
  }
  if (detail.holonyms.length > 0) {
    relations.push(`- **Part of:** ${detail.holonyms.join(", ")}`);
  }
  if (detail.meronyms.length > 0) {
    relations.push(`- **Parts:** ${detail.meronyms.join(", ")}`);
  }
  if (detail.derived_forms.length > 0) {
    relations.push(`- **Derived forms:** ${detail.derived_forms.join(", ")}`);
  }

  if (relations.length > 0) {
    lines.push("---");
    lines.push("## Relations");
    lines.push(...relations);
  }

  return lines.join("\n");
}

/**
 * Format a concise one-line definition string for copy-to-clipboard or HUD display.
 */
export function formatShortDefinition(detail: WordDetail): string {
  if (detail.senses.length === 0) return detail.word;
  const first = detail.senses[0];
  const pos = POS_LABELS[first.pos] ?? first.pos;
  return `${detail.word} (${pos}): ${first.definition}`;
}

/**
 * Format the full word detail as a plain-text string for clipboard copy.
 */
export function formatWordDetailPlainText(detail: WordDetail): string {
  const lines: string[] = [];
  lines.push(detail.word);
  if (detail.pronunciation) {
    lines.push(`/${detail.pronunciation}/`);
  }
  lines.push("");

  const grouped = groupByPos(detail.senses);
  for (const [pos, senses] of grouped) {
    const label = POS_LABELS[pos] ?? pos;
    lines.push(`  ${label.toUpperCase()}`);
    for (const sense of senses) {
      lines.push(`    ${sense.sense_num}. ${sense.definition}`);
      if (sense.synonyms.length > 0) {
        lines.push(`       Synonyms: ${sense.synonyms.join(", ")}`);
      }
      if (sense.antonyms.length > 0) {
        lines.push(`       Antonyms: ${sense.antonyms.join(", ")}`);
      }
      if (sense.examples.length > 0) {
        lines.push(`       Example: "${sense.examples[0]}"`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Helpers ────────────────────────────────────────────────

interface SenseGroup {
  pos: string;
  definition: string;
  synonyms: string[];
  antonyms: string[];
  examples: string[];
  sense_num: number;
}

function groupByPos(senses: SenseGroup[]): Map<string, SenseGroup[]> {
  const map = new Map<string, SenseGroup[]>();
  for (const sense of senses) {
    const key = sense.pos;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(sense);
  }
  return map;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
