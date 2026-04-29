import { LocalStorage } from "@vicinae/api";
import { stripSensitive } from "../utils/cache";
import type { Folder, Item } from "../types/bitwarden";

const KEY_CACHE_ITEMS = "rbw.cache.items";
const KEY_CACHE_FOLDERS = "rbw.cache.folders";
const KEY_CACHE_MTIME = "rbw.cache.mtime";
const KEY_SERVER_URL = "rbw.server-url";
const KEY_LAST_SYNC = "rbw.last-sync";
const KEY_REPROMPT = "rbw.reprompt-ts";
const KEY_TOTP_KNOWN = "rbw.totp.known";    // Set<id> known to have TOTP
const KEY_TOTP_DENY = "rbw.totp.deny";      // Set<id> probed and confirmed no TOTP

// rbw-agent owns the unlock state. SessionProvider asks rbw whether the agent
// is unlocked instead of consulting persisted token bytes.
export async function saveSession(_token: string): Promise<void> { /* no-op */ }
export async function loadSession(): Promise<string | null> { return null; }
export async function clearSession(): Promise<void> { /* no-op */ }

export async function saveCache(items: Item[], folders: Folder[]): Promise<void> {
  await LocalStorage.setItem(KEY_CACHE_ITEMS, JSON.stringify(stripSensitive(items)));
  await LocalStorage.setItem(KEY_CACHE_FOLDERS, JSON.stringify(folders));
  await LocalStorage.setItem(KEY_CACHE_MTIME, String(Date.now()));
}

export async function loadCache(): Promise<{ items: Item[]; folders: Folder[]; mtime: number } | null> {
  const rawItems = await LocalStorage.getItem<string>(KEY_CACHE_ITEMS);
  const rawFolders = await LocalStorage.getItem<string>(KEY_CACHE_FOLDERS);
  if (!rawItems || !rawFolders) return null;
  const rawMtime = await LocalStorage.getItem<string>(KEY_CACHE_MTIME);
  return {
    items: JSON.parse(rawItems) as Item[],
    folders: JSON.parse(rawFolders) as Folder[],
    mtime: rawMtime ? Number(rawMtime) : 0,
  };
}

export async function clearCache(): Promise<void> {
  await LocalStorage.removeItem(KEY_CACHE_ITEMS);
  await LocalStorage.removeItem(KEY_CACHE_FOLDERS);
  await LocalStorage.removeItem(KEY_CACHE_MTIME);
}

export async function getLastSync(): Promise<number | null> {
  const raw = await LocalStorage.getItem<string>(KEY_LAST_SYNC);
  return raw !== undefined ? Number(raw) : null;
}

export async function setLastSync(): Promise<void> {
  await LocalStorage.setItem(KEY_LAST_SYNC, String(Date.now()));
}

export async function getLastAppliedServerUrl(): Promise<string | null> {
  const raw = await LocalStorage.getItem<string>(KEY_SERVER_URL);
  return raw ?? null;
}

export async function setLastAppliedServerUrl(url: string): Promise<void> {
  await LocalStorage.setItem(KEY_SERVER_URL, url);
}

export async function setRepromptTimestamp(itemId: string): Promise<void> {
  await LocalStorage.setItem(`${KEY_REPROMPT}.${itemId}`, String(Date.now()));
}

export async function getRepromptTimestamp(itemId: string): Promise<number | null> {
  const raw = await LocalStorage.getItem<string>(`${KEY_REPROMPT}.${itemId}`);
  return raw !== undefined ? Number(raw) : null;
}

export async function clearAllReprompt(): Promise<void> {
  const all = await LocalStorage.allItems();
  await Promise.all(
    Object.keys(all)
      .filter((k) => k.startsWith(`${KEY_REPROMPT}.`))
      .map((k) => LocalStorage.removeItem(k)),
  );
}

async function readIdSet(key: string): Promise<Set<string>> {
  const raw = await LocalStorage.getItem<string>(key);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw) as string[]); } catch { return new Set(); }
}

async function writeIdSet(key: string, set: Set<string>): Promise<void> {
  await LocalStorage.setItem(key, JSON.stringify([...set]));
}

export async function loadTotpClassification(): Promise<{ known: Set<string>; deny: Set<string> }> {
  const [known, deny] = await Promise.all([readIdSet(KEY_TOTP_KNOWN), readIdSet(KEY_TOTP_DENY)]);
  return { known, deny };
}

export async function saveTotpClassification(known: Set<string>, deny: Set<string>): Promise<void> {
  await Promise.all([writeIdSet(KEY_TOTP_KNOWN, known), writeIdSet(KEY_TOTP_DENY, deny)]);
}
