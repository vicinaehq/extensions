import { environment } from "@vicinae/api";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  SNIPPET_STORE_SCHEMA_VERSION,
  Snippet,
  SnippetStoreFile,
  nowIso,
  normalizeLineEndings,
  normalizeText,
  snippetDedupeKey,
} from "./snippet-model";

const STORE_FILE_NAME = "snippets.json";

function storeFilePath(): string {
  return path.join(environment.supportPath, STORE_FILE_NAME);
}

async function ensureSupportDir(): Promise<void> {
  await fs.mkdir(environment.supportPath, { recursive: true });
}

function emptyStore(): SnippetStoreFile {
  return {
    schemaVersion: SNIPPET_STORE_SCHEMA_VERSION,
    updatedAt: nowIso(),
    snippets: [],
  };
}

async function readJsonFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return undefined;
    throw err;
  }
}

async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  await ensureSupportDir();

  // Use a unique tmp file to reduce collisions across concurrent writes (multiple commands/windows).
  const tmpPath = `${filePath}.tmp-${crypto.randomUUID()}`;
  const backupPath = `${filePath}.bak`;

  // best-effort backup
  try {
    await fs.copyFile(filePath, backupPath);
  } catch {
    // ignore
  }

  await fs.writeFile(tmpPath, contents, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function loadStore(): Promise<SnippetStoreFile> {
  const filePath = storeFilePath();
  const raw = await readJsonFile(filePath);
  if (!raw) return emptyStore();

  try {
    const parsed = JSON.parse(raw) as Partial<SnippetStoreFile>;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    if (!Array.isArray(parsed.snippets)) return emptyStore();

    return {
      schemaVersion:
        typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : SNIPPET_STORE_SCHEMA_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
      snippets: parsed.snippets as Snippet[],
    };
  } catch {
    // preserve the corrupt file for manual recovery
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.rename(filePath, `${filePath}.corrupt-${ts}`);
    } catch {
      // ignore
    }
    return emptyStore();
  }
}

export async function saveStore(store: SnippetStoreFile): Promise<void> {
  const filePath = storeFilePath();
  const toWrite: SnippetStoreFile = {
    ...store,
    schemaVersion: SNIPPET_STORE_SCHEMA_VERSION,
    updatedAt: nowIso(),
  };
  await writeFileAtomic(filePath, JSON.stringify(toWrite, null, 2));
}

export async function listSnippets(): Promise<Snippet[]> {
  const store = await loadStore();
  return [...store.snippets].sort((a, b) => {
    const ap = a.isPinned ? 1 : 0;
    const bp = b.isPinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return a.title.localeCompare(b.title);
  });
}

export interface CreateSnippetInput {
  title: string;
  content: string;
  category?: string;
  keyword?: string;
}

export async function createSnippet(input: CreateSnippetInput): Promise<Snippet> {
  const title = normalizeText(input.title);
  const content = normalizeLineEndings(input.content);
  const category = input.category ? normalizeText(input.category) : undefined;
  const keyword = input.keyword ? normalizeText(input.keyword) : undefined;

  if (!title) throw new Error("Title is required");
  // Validation uses `trim()`, but storage keeps leading/trailing whitespace/newlines (better for code snippets).
  if (!content.trim()) throw new Error("Content is required");

  const now = nowIso();
  const snippet: Snippet = {
    id: crypto.randomUUID(),
    title,
    content,
    category: category || undefined,
    keyword: keyword || undefined,
    createdAt: now,
    updatedAt: now,
    timesCopied: 0,
  };

  const store = await loadStore();
  store.snippets.push(snippet);
  await saveStore(store);
  return snippet;
}

export async function updateSnippet(id: string, patch: Partial<CreateSnippetInput>): Promise<Snippet> {
  const store = await loadStore();
  const idx = store.snippets.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error("Snippet not found");

  const current = store.snippets[idx];
  // Allow explicitly clearing optional fields:
  // - `{ category: undefined }` means "clear category" (not "don't update")
  // - `{ keyword: undefined }` means "clear keyword"
  // This is required for "empty means clear" in forms and for "Move to Uncategorized".
  const hasCategory = Object.prototype.hasOwnProperty.call(patch, "category");
  const hasKeyword = Object.prototype.hasOwnProperty.call(patch, "keyword");
  const updated: Snippet = {
    ...current,
    title: patch.title !== undefined ? normalizeText(patch.title) : current.title,
    content: patch.content !== undefined ? normalizeLineEndings(patch.content) : current.content,
    category: hasCategory ? normalizeText(patch.category ?? "") || undefined : current.category,
    keyword: hasKeyword ? normalizeText(patch.keyword ?? "") || undefined : current.keyword,
    updatedAt: nowIso(),
  };

  if (!updated.title) throw new Error("Title is required");
  if (!updated.content.trim()) throw new Error("Content is required");

  store.snippets[idx] = updated;
  await saveStore(store);
  return updated;
}

export async function deleteSnippet(id: string): Promise<void> {
  const store = await loadStore();
  const next = store.snippets.filter((s) => s.id !== id);
  store.snippets = next;
  await saveStore(store);
}

export async function duplicateSnippet(id: string): Promise<Snippet> {
  const store = await loadStore();
  const src = store.snippets.find((s) => s.id === id);
  if (!src) throw new Error("Snippet not found");

  const now = nowIso();
  const copy: Snippet = {
    ...src,
    id: crypto.randomUUID(),
    title: `${src.title} (copy)`,
    createdAt: now,
    updatedAt: now,
    timesCopied: 0,
    lastCopiedAt: undefined,
    isPinned: undefined,
  };
  store.snippets.push(copy);
  await saveStore(store);
  return copy;
}

export async function recordSuccessfulCopyOrPaste(id: string): Promise<void> {
  const store = await loadStore();
  const idx = store.snippets.findIndex((s) => s.id === id);
  if (idx < 0) return;

  const s = store.snippets[idx];
  store.snippets[idx] = {
    ...s,
    timesCopied: (s.timesCopied ?? 0) + 1,
    lastCopiedAt: nowIso(),
  };
  await saveStore(store);
}

export async function setSnippetPinned(id: string, pinned: boolean): Promise<Snippet> {
  const store = await loadStore();
  const idx = store.snippets.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error("Snippet not found");

  const s = store.snippets[idx];
  const next: Snippet = {
    ...s,
    isPinned: pinned ? true : undefined,
    updatedAt: nowIso(),
  };
  store.snippets[idx] = next;
  await saveStore(store);
  return next;
}

export async function hasDuplicate(title: string, content: string): Promise<boolean> {
  const store = await loadStore();
  const key = snippetDedupeKey({ title, content });
  return store.snippets.some((s) => snippetDedupeKey(s) === key);
}
