import { Cache, getPreferenceValues } from "@vicinae/api";
import type { ExtensionPreferences, HistoryEntry, Mode } from "../types/index";

const cache = new Cache();
const HISTORY_KEY = "ollama-wordsmith-history";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getMaxSize(): number {
  try {
    const prefs = getPreferenceValues<ExtensionPreferences>();
    const size = parseInt(prefs.maxHistorySize, 10);
    return Number.isFinite(size) && size > 0 ? size : 50;
  } catch {
    return 50;
  }
}

export function getHistory(): HistoryEntry[] {
  const raw = cache.get(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function addEntry(
  mode: Mode,
  input: string,
  output: string,
  model: string,
  targetLanguage: string,
): void {
  const entries = getHistory();
  const entry: HistoryEntry = {
    id: generateId(),
    mode,
    input,
    output,
    model,
    targetLanguage,
    timestamp: Date.now(),
  };

  entries.unshift(entry);

  const maxSize = getMaxSize();
  if (entries.length > maxSize) {
    entries.length = maxSize;
  }

  cache.set(HISTORY_KEY, JSON.stringify(entries));
}

export function clearHistory(): void {
  cache.remove(HISTORY_KEY);
}

export function removeEntry(id: string): void {
  const entries = getHistory().filter((e) => e.id !== id);
  cache.set(HISTORY_KEY, JSON.stringify(entries));
}

function getModelCacheKey(mode: Mode): string {
  return `ollama-wordsmith-model-${mode}`;
}

export function getCachedModel(mode: Mode): string | undefined {
  const val = cache.get(getModelCacheKey(mode));
  return val || undefined;
}

export function setCachedModel(mode: Mode, model: string): void {
  cache.set(getModelCacheKey(mode), model);
}
