import { randomUUID } from "node:crypto";

const STORAGE_KEY = "depot.recent-actions.v1";
const HISTORY_LIMIT = 25;
const TEXT_LIMIT = 300;

export type RecentActionKind = "installed" | "integrated" | "removed" | "updated";
export type RecentActionSource = "APT" | "Flatpak" | "AppImage";

export interface RecentAction {
  id: string;
  kind: RecentActionKind;
  name: string;
  identifier: string;
  source: RecentActionSource;
  timestamp: string;
}

export type NewRecentAction = Pick<
  RecentAction,
  "kind" | "name" | "identifier" | "source"
>;

let pendingWrite = Promise.resolve();

export async function readRecentActions(): Promise<RecentAction[]> {
  const { LocalStorage } = await import("@vicinae/api");
  const value = await LocalStorage.getItem<string>(STORAGE_KEY);
  return parseRecentActions(value);
}

export function recordRecentAction(action: NewRecentAction): Promise<void> {
  return recordRecentActions([action]);
}

export function recordRecentActions(actions: readonly NewRecentAction[]): Promise<void> {
  if (actions.length === 0) return Promise.resolve();
  const write = async () => {
    const { LocalStorage } = await import("@vicinae/api");
    const recent = await readRecentActions();
    const now = new Date();
    const next = actions.reduceRight(
      (history, action) =>
        prependRecentAction(history, action, now, randomUUID()),
      recent,
    );
    await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  pendingWrite = pendingWrite.then(write, write).catch((error: unknown) => {
    console.debug("Recent action could not be saved", error);
  });
  return pendingWrite;
}

export async function clearRecentActions(): Promise<void> {
  const clear = async () => {
    const { LocalStorage } = await import("@vicinae/api");
    await LocalStorage.removeItem(STORAGE_KEY);
  };
  pendingWrite = pendingWrite.then(clear, clear).catch((error: unknown) => {
    console.debug("Recent actions could not be cleared", error);
  });
  await pendingWrite;
}

export function prependRecentAction(
  existing: readonly RecentAction[],
  action: NewRecentAction,
  timestamp: Date,
  id: string,
): RecentAction[] {
  return [{
    id: cleanText(id),
    kind: action.kind,
    name: cleanText(action.name),
    identifier: cleanText(action.identifier),
    source: action.source,
    timestamp: timestamp.toISOString(),
  }, ...existing].slice(0, HISTORY_LIMIT);
}

export function parseRecentActions(value: unknown): RecentAction[] {
  if (typeof value !== "string") return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecentAction)
      .slice(0, HISTORY_LIMIT)
      .map((action) => ({
        ...action,
        id: cleanText(action.id),
        name: cleanText(action.name),
        identifier: cleanText(action.identifier),
      }));
  } catch {
    return [];
  }
}

function isRecentAction(value: unknown): value is RecentAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<RecentAction>;
  return typeof action.id === "string" &&
    isActionKind(action.kind) &&
    typeof action.name === "string" &&
    typeof action.identifier === "string" &&
    isActionSource(action.source) &&
    typeof action.timestamp === "string" &&
    !Number.isNaN(Date.parse(action.timestamp));
}

function isActionKind(value: unknown): value is RecentActionKind {
  return value === "installed" || value === "integrated" ||
    value === "removed" || value === "updated";
}

function isActionSource(value: unknown): value is RecentActionSource {
  return value === "APT" || value === "Flatpak" || value === "AppImage";
}

function cleanText(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, TEXT_LIMIT);
}
