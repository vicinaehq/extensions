export const SNIPPET_STORE_SCHEMA_VERSION = 1;

export type ISODateTimeString = string;

export interface Snippet {
  id: string;
  title: string;
  content: string;
  category?: string;
  /**
   * Search-only alias inside Vicinae (no global auto-expansion).
   */
  keyword?: string;

  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  timesCopied: number;
  lastCopiedAt?: ISODateTimeString;
  isPinned?: boolean;
}

export interface SnippetStoreFile {
  schemaVersion: number;
  updatedAt: ISODateTimeString;
  snippets: Snippet[];
}

export interface ImportError {
  itemHint: string;
  reason: string;
}

export interface ImportReport {
  addedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: ImportError[];
}

export interface ArgumentSpec {
  /**
   * Unique argument key: prefer `{argument name="..."}`; otherwise generate `arg1/arg2/arg3`
   * in order of appearance.
   */
  key: string;
  name?: string;
  defaultValue?: string;
  options?: string[];
  required: boolean;
}

export function nowIso(): ISODateTimeString {
  return new Date().toISOString();
}

export function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function normalizeText(input: string): string {
  return normalizeLineEndings(input).trim();
}

export function normalizeContentForDedupe(input: string): string {
  // Keep leading indentation (important for code snippets), but normalize line endings
  // and trim trailing blank lines (often introduced by editors/padding).
  const normalized = normalizeLineEndings(input);
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }
  return lines.join("\n");
}

export function snippetDedupeKey(snippet: Pick<Snippet, "title" | "content">): string {
  return `${normalizeText(snippet.title)}\n${normalizeContentForDedupe(snippet.content)}`;
}
