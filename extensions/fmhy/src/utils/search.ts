import type { FMHYLink } from "../types";

/**
 * Search links with multi-word AND logic and relevance scoring
 */
export function searchLinks(query: string, links: FMHYLink[]): FMHYLink[] {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) return [];

  const words = trimmedQuery.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // 1. Filter: All words must appear in title, description, category or subcategory
  const matches = links.filter((link) => {
    const searchableText =
      `${link.title} ${link.description} ${link.category} ${link.subcategory} ${link.subSubcategory || ""}`.toLowerCase();
    return words.every((word) => searchableText.includes(word));
  });

  // 2. Rank: Score results based on match quality
  return matches.sort((a, b) => {
    const scoreA = getMatchScore(a, trimmedQuery, words);
    const scoreB = getMatchScore(b, trimmedQuery, words);
    return scoreB - scoreA;
  });
}

/**
 * Calculate match score for ranking
 * Higher score = more relevant
 */
function getMatchScore(link: FMHYLink, query: string, words: string[]): number {
  let score = 0;
  const title = link.title.toLowerCase();
  const description = link.description.toLowerCase();

  // Exact phrase match in title (Highest priority)
  if (title.includes(query)) {
    score += 100;
    if (title === query) score += 50; // Exact match
  }

  // All words in title
  const allWordsInTitle = words.every((word) => title.includes(word));
  if (allWordsInTitle) score += 50;

  // Starts with query
  if (title.startsWith(query)) score += 30;

  // Individual word matches in title
  for (const word of words) {
    if (title.includes(word)) score += 10;
  }

  // Exact phrase match in description
  if (description.includes(query)) score += 20;

  // Starred links get a boost
  if (link.isStarred) score += 15;

  return score;
}
