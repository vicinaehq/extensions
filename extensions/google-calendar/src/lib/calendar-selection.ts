import { getExtensionPreferences } from "../preferences";
import type { CalendarListEntry } from "../api/calendar";

/**
 * Default-calendar + visibility state for the List Events command.
 *
 * Precedence for the default calendar:
 *   1. the `defaultCalendarId` extension preference (when set),
 *   2. the calendar id persisted via "Set as Default",
 *   3. the account's primary calendar,
 *   4. the first listed calendar, else "primary".
 *
 * Hidden-calendar ids are a JSON array under a single LocalStorage key.
 *
 * No static `@vicinae/api` import here (it crashes outside the Vicinae
 * host); LocalStorage is required lazily, mirroring `src/auth/tokens.ts`.
 */

export const DEFAULT_CALENDAR_STORAGE_KEY = "google-calendar:default-calendar-id";
export const HIDDEN_CALENDARS_STORAGE_KEY = "google-calendar:hidden-calendar-ids";

// eslint-disable-next-line @typescript-eslint/no-require-imports
function vicinaeLocalStorage(): typeof import("@vicinae/api").LocalStorage {
  return (require("@vicinae/api") as typeof import("@vicinae/api")).LocalStorage;
}

function preferenceDefaultCalendarId(): string | undefined {
  try {
    return getExtensionPreferences().defaultCalendarId;
  } catch {
    return undefined;
  }
}

export async function getStoredDefaultCalendarId(): Promise<string | undefined> {
  try {
    const value = await vicinaeLocalStorage().getItem<string>(DEFAULT_CALENDAR_STORAGE_KEY);
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function setStoredDefaultCalendarId(calendarId: string): Promise<void> {
  await vicinaeLocalStorage().setItem(DEFAULT_CALENDAR_STORAGE_KEY, calendarId);
}

/** Resolve the effective default calendar id given the listed calendars. */
export async function getDefaultCalendarId(
  calendars?: Pick<CalendarListEntry, "id" | "primary">[],
): Promise<string> {
  const preferred = preferenceDefaultCalendarId();
  if (preferred) return preferred;
  const stored = await getStoredDefaultCalendarId();
  if (stored) return stored;
  const primary = calendars?.find((c) => c.primary)?.id;
  if (primary) return primary;
  const first = calendars?.[0]?.id;
  return first ?? "primary";
}

export async function getHiddenCalendarIds(): Promise<string[]> {
  try {
    const raw = await vicinaeLocalStorage().getItem<string>(HIDDEN_CALENDARS_STORAGE_KEY);
    if (typeof raw !== "string" || raw.length === 0) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export async function setHiddenCalendarIds(ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  await vicinaeLocalStorage().setItem(HIDDEN_CALENDARS_STORAGE_KEY, JSON.stringify(unique));
}

export async function isCalendarHidden(calendarId: string): Promise<boolean> {
  const hidden = await getHiddenCalendarIds();
  return hidden.includes(calendarId);
}

/** Toggle visibility; returns true when the calendar is now hidden. */
export async function toggleCalendarHidden(calendarId: string): Promise<boolean> {
  const hidden = await getHiddenCalendarIds();
  const next = hidden.includes(calendarId)
    ? hidden.filter((id) => id !== calendarId)
    : [...hidden, calendarId];
  await setHiddenCalendarIds(next);
  return next.includes(calendarId);
}

export async function getVisibleCalendars<T extends { id: string }>(
  calendars: T[],
): Promise<T[]> {
  const hidden = await getHiddenCalendarIds();
  if (hidden.length === 0) return calendars;
  const hiddenSet = new Set(hidden);
  return calendars.filter((c) => !hiddenSet.has(c.id));
}

export const CALENDARS_CACHE_KEY = "google-calendar:calendar-list";
export const CALENDARS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CalendarListingClient {
  listCalendars(): Promise<CalendarListEntry[]>;
}

let sharedCache: import("@vicinae/api").Cache | undefined;

// eslint-disable-next-line @typescript-eslint/no-require-imports
function loadCache(): import("@vicinae/api").Cache | undefined {
  if (sharedCache !== undefined) return sharedCache;
  try {
    const api = require("@vicinae/api") as typeof import("@vicinae/api");
    sharedCache = new api.Cache();
  } catch {
    sharedCache = undefined;
  }
  return sharedCache;
}

/**
 * Calendar list with a short (5 minute) disk cache so every command —
 * and every keystroke in List Events — does not hit the network.
 * Falls back to a plain network fetch when the cache is unavailable.
 */
export async function fetchCalendarsWithCache(
  client: CalendarListingClient,
): Promise<CalendarListEntry[]> {
  const cache = loadCache();
  if (cache) {
    try {
      const raw = cache.get(CALENDARS_CACHE_KEY);
      if (typeof raw === "string" && raw.length > 0) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as CalendarListEntry[];
      }
    } catch {
      // Corrupt/expired cache — fetch from the network below.
    }
  }
  const calendars = await client.listCalendars();
  if (cache) {
    try {
      cache.set(CALENDARS_CACHE_KEY, JSON.stringify(calendars), {
        ttl: CALENDARS_CACHE_TTL_MS,
      });
    } catch {
      // Cache write failures must never break the command.
    }
  }
  return calendars;
}

export function invalidateCalendarsCache(): void {
  try {
    loadCache()?.remove(CALENDARS_CACHE_KEY);
  } catch {
    // Ignore — worst case the list is up to 5 minutes stale.
  }
}
