import { Snippet } from "./snippet-model";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function normalizeForSearch(value: string): string {
  return value.trim();
}

export function collectCategories(snippets: Snippet[]): string[] {
  const categories = snippets
    .map((s) => s.category)
    .filter((v): v is string => Boolean(v))
    .map(normalizeForSearch)
    .filter(Boolean);
  return uniq(categories).sort((a, b) => a.localeCompare(b));
}

export function filterByCategory(snippets: Snippet[], category?: string): Snippet[] {
  const c = category?.trim();
  if (!c || c === "__ALL__") return snippets;
  return snippets.filter((s) => (s.category ?? "").trim() === c);
}

export function listKeywordsForSnippet(snippet: Snippet): string[] {
  const out: string[] = [];
  if (snippet.keyword) out.push(normalizeForSearch(snippet.keyword));
  if (snippet.category) out.push(normalizeForSearch(snippet.category));

  // Low-weight keyword for content matching: only take the first 200 chars for performance.
  const content = snippet.content?.trim();
  if (content) out.push(content.slice(0, 200));

  return out.filter(Boolean);
}
