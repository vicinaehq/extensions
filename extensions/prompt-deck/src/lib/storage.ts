import { LocalStorage } from "@vicinae/api";
import { createId } from "./id";
import { parseProviderId } from "./providers";
import { trimText } from "./string";
import type { ChatMessage, ContextBlock, ContextSource, LlmShortcut, ShortcutRun } from "./types";

const SHORTCUTS_KEY = "prompt-deck.shortcuts.v1";
const RUNS_KEY = "prompt-deck.runs.v1";
const LEGACY_SHORTCUTS_KEY = "quick-llm-shortcuts.shortcuts.v1";
const LEGACY_RUNS_KEY = "quick-llm-shortcuts.runs.v1";
const MAX_RUNS = 200;

/**
 * Repository for persisted shortcuts and run history.
 */
export class ShortcutRepository {
  async listShortcuts(): Promise<LlmShortcut[]> {
    const shortcuts = await readJson<LlmShortcut>(SHORTCUTS_KEY);
    return shortcuts.map(normalizeShortcut).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getShortcut(id: string): Promise<LlmShortcut | undefined> {
    const shortcuts = await this.listShortcuts();
    return shortcuts.find((shortcut) => shortcut.id === id);
  }

  async saveShortcut(shortcut: LlmShortcut): Promise<void> {
    const shortcuts = await this.listShortcuts();
    const existingIndex = shortcuts.findIndex((item) => item.id === shortcut.id);

    if (existingIndex >= 0) {
      shortcuts[existingIndex] = shortcut;
    } else {
      shortcuts.push(shortcut);
    }

    await writeJson(SHORTCUTS_KEY, shortcuts);
  }

  async deleteShortcut(id: string): Promise<void> {
    const shortcuts = await this.listShortcuts();
    await writeJson(
      SHORTCUTS_KEY,
      shortcuts.filter((shortcut) => shortcut.id !== id),
    );
  }

  async listRuns(): Promise<ShortcutRun[]> {
    const runs = await readJson<ShortcutRun>(RUNS_KEY);
    return runs.map(normalizeRun).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async saveRun(run: ShortcutRun): Promise<void> {
    const runs = await this.listRuns();
    const existingIndex = runs.findIndex((item) => item.id === run.id);

    if (existingIndex >= 0) {
      runs[existingIndex] = run;
    } else {
      runs.unshift(run);
    }

    await writeJson(RUNS_KEY, runs.slice(0, MAX_RUNS));
  }

  async deleteRun(id: string): Promise<void> {
    const runs = await this.listRuns();
    await writeJson(
      RUNS_KEY,
      runs.filter((run) => run.id !== id),
    );
  }

  async clearRuns(): Promise<void> {
    await writeJson(RUNS_KEY, []);
  }
}

/**
 * Keeps older persisted shortcut records compatible with the current schema.
 */
function normalizeShortcut(shortcut: LlmShortcut): LlmShortcut {
  const contextSources = (shortcut.contextSources ?? []).filter(isContextSource);
  const maxOutputTokens = shortcut.maxOutputTokens;

  return {
    ...shortcut,
    id: trimText(shortcut.id),
    name: trimText(shortcut.name) || "Untitled Prompt",
    alias: trimText(shortcut.alias),
    description: trimText(shortcut.description),
    systemPrompt: trimText(shortcut.systemPrompt),
    defaultCommand: trimText(shortcut.defaultCommand),
    contextSources,
    provider: parseProviderId(shortcut.provider),
    model: trimText(shortcut.model) || undefined,
    reasoningLevel: trimText(shortcut.reasoningLevel) || undefined,
    maxOutputTokens:
      typeof maxOutputTokens === "number" && Number.isInteger(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : undefined,
    closeWindowOnCopy: shortcut.closeWindowOnCopy ?? false,
    pasteToActiveApp: shortcut.pasteToActiveApp ?? false,
    createdAt: trimText(shortcut.createdAt) || new Date().toISOString(),
    updatedAt: trimText(shortcut.updatedAt) || new Date().toISOString(),
  };
}

function isContextSource(source: unknown): source is ContextSource {
  return source === "selectedText" || source === "clipboardText";
}

function normalizeRun(run: ShortcutRun): ShortcutRun {
  return {
    ...run,
    id: trimText(run.id),
    shortcutId: trimText(run.shortcutId),
    shortcutName: trimText(run.shortcutName) || "Untitled Prompt",
    command: trimText(run.command),
    contextBlocks: (run.contextBlocks ?? []).map(normalizeContextBlock).filter((block): block is ContextBlock => Boolean(block)),
    messages: (run.messages ?? []).map(normalizeMessage).filter((message): message is ChatMessage => Boolean(message)),
    model: trimText(run.model),
    provider: parseProviderId(run.provider) ?? "openai",
    closeWindowOnCopy: run.closeWindowOnCopy ?? false,
    createdAt: trimText(run.createdAt) || new Date().toISOString(),
    updatedAt: trimText(run.updatedAt) || new Date().toISOString(),
  };
}

function normalizeContextBlock(block: ContextBlock): ContextBlock | undefined {
  if (!isContextSource(block?.source)) {
    return undefined;
  }

  const content = trimText(block.content);
  if (!content) {
    return undefined;
  }

  return {
    source: block.source,
    title: trimText(block.title) || "Context",
    content,
  };
}

function normalizeMessage(message: ChatMessage): ChatMessage | undefined {
  if (message?.role !== "user" && message?.role !== "assistant") {
    return undefined;
  }

  return {
    id: trimText(message.id) || createId("message"),
    role: message.role,
    content: trimText(message.content),
    createdAt: trimText(message.createdAt) || new Date().toISOString(),
  };
}

let migration: Promise<void> | undefined;

/**
 * One-time copy of data stored under the extension's previous name
 * ("quick-llm-shortcuts"). Old keys are left untouched.
 */
function ensureMigrated(): Promise<void> {
  migration ??= Promise.all([
    migrateLegacyKey(SHORTCUTS_KEY, LEGACY_SHORTCUTS_KEY),
    migrateLegacyKey(RUNS_KEY, LEGACY_RUNS_KEY),
  ]).then(
    () => undefined,
    (error) => {
      // Don't cache a failed attempt — retry on the next storage access.
      migration = undefined;
      throw error;
    },
  );

  return migration;
}

async function migrateLegacyKey(newKey: string, oldKey: string): Promise<void> {
  const existing = await LocalStorage.getItem<string>(newKey);
  if (existing) {
    return;
  }

  const legacy = await LocalStorage.getItem<string>(oldKey);
  if (legacy) {
    await LocalStorage.setItem(newKey, legacy);
  }
}

async function readJson<T>(key: string): Promise<T[]> {
  await ensureMigrated();
  const value = await LocalStorage.getItem<string>(key);
  if (!value) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    // Rethrow instead of falling back: returning [] here would let the next
    // write overwrite the corrupted-but-recoverable data.
    console.error(`Failed to parse stored data for "${key}"`, error);
    throw new Error("Stored data is corrupted and could not be read.");
  }

  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await ensureMigrated();
  await LocalStorage.setItem(key, JSON.stringify(value));
}
