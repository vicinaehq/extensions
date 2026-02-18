import crypto from "node:crypto";

import {
  ImportReport,
  Snippet,
  SnippetStoreFile,
  nowIso,
  normalizeLineEndings,
  normalizeText,
  snippetDedupeKey,
} from "./snippet-model";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function pickTitle(raw: AnyRecord): string | undefined {
  return asString(raw.title) ?? asString(raw.name);
}

function pickContent(raw: AnyRecord): string | undefined {
  return asString(raw.content) ?? asString(raw.text) ?? asString(raw.snippet);
}

function pickKeyword(raw: AnyRecord): string | undefined {
  return asString(raw.keyword);
}

function pickCategory(raw: AnyRecord): string | undefined {
  return asString(raw.category);
}

function coerceSnippets(payload: unknown): AnyRecord[] {
  // Support both input shapes:
  // 1) { snippets: [...] } (this extension schema)
  // 2) [...] (array)
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload) && Array.isArray(payload.snippets)) return payload.snippets.filter(isRecord);
  return [];
}

function toSnippet(raw: AnyRecord): Snippet | undefined {
  const title = pickTitle(raw);
  const content = pickContent(raw);
  if (!title || !content) return undefined;

  const nt = normalizeText(title);
  const nc = normalizeLineEndings(content);
  if (!nt || !nc.trim()) return undefined;

  const category = pickCategory(raw);
  const keyword = pickKeyword(raw);
  const now = nowIso();
  return {
    id: crypto.randomUUID(),
    title: nt,
    content: nc,
    category: category ? normalizeText(category) || undefined : undefined,
    keyword: keyword ? normalizeText(keyword) || undefined : undefined,
    createdAt: now,
    updatedAt: now,
    timesCopied: 0,
  };
}

export function exportStoreToJson(store: SnippetStoreFile): string {
  return JSON.stringify(store, null, 2);
}

export function importFromJsonTextToStore(
  jsonText: string,
  existingSnippets: Snippet[],
): { mergedSnippets: Snippet[]; report: ImportReport } {
  const report: ImportReport = { addedCount: 0, skippedCount: 0, failedCount: 0, errors: [] };

  // Support UTF-8 JSON with BOM.
  const normalized = jsonText.replace(/^\uFEFF/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    report.failedCount = 1;
    report.errors.push({ itemHint: "JSON", reason: "Invalid JSON" });
    return { mergedSnippets: existingSnippets, report };
  }

  const incoming = coerceSnippets(parsed);
  if (incoming.length === 0) {
    report.failedCount = 1;
    report.errors.push({
      itemHint: "payload",
      reason: "No snippets array found (expected an array or {snippets:[...]})",
    });
    return { mergedSnippets: existingSnippets, report };
  }

  const mergedSnippets: Snippet[] = [...existingSnippets];
  const existingKeys = new Set(existingSnippets.map((s) => snippetDedupeKey(s)));

  for (const item of incoming) {
    const s = toSnippet(item);
    if (!s) {
      report.failedCount += 1;
      report.errors.push({
        itemHint: JSON.stringify(item).slice(0, 120),
        reason: "Missing required fields: title/name and content/text",
      });
      continue;
    }

    const key = snippetDedupeKey(s);
    if (existingKeys.has(key)) {
      report.skippedCount += 1;
      continue;
    }

    existingKeys.add(key);
    mergedSnippets.push(s);
    report.addedCount += 1;
  }

  return { mergedSnippets, report };
}

export async function importFromJsonText(jsonText: string): Promise<ImportReport> {
  const { loadStore, saveStore } = await import("./snippet-store");
  const store = await loadStore();
  const { mergedSnippets, report } = importFromJsonTextToStore(jsonText, store.snippets);
  store.snippets = mergedSnippets;
  await saveStore(store);
  return report;
}
