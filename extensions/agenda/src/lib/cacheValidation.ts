import { CACHE_DURATION, CACHE_VERSION } from "./constants";
import { Calendar } from "./types";
import { getCalendarName } from "./calendar";

export interface CacheData {
  eventsByDate: Record<string, unknown[]>;
  eventCalendars: Record<string, string>;
  calendarUrls: string[];
  calendarNames: string[];
  timestamp: number;
  cacheVersion: number;
}

export interface CacheValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate cache data against current calendars and time constraints.
 */
export function validateCache(
  cacheData: Partial<CacheData>,
  calendars: Calendar[],
  now: number = Date.now(),
): CacheValidationResult {
  // Check required fields
  if (!cacheData.eventCalendars) {
    return { valid: false, reason: "missing eventCalendars" };
  }

  if (cacheData.timestamp === undefined) {
    return { valid: false, reason: "missing timestamp" };
  }

  // Check cache version
  if (cacheData.cacheVersion !== CACHE_VERSION) {
    return { valid: false, reason: "version mismatch" };
  }

  // Check cache expiration
  if (now - cacheData.timestamp >= CACHE_DURATION) {
    return { valid: false, reason: "expired" };
  }

  // Check calendar URLs match
  const currentCalendarUrls = calendars.map((cal) => cal.url).sort();
  const cachedCalendarUrls = (cacheData.calendarUrls || []).sort();
  if (
    JSON.stringify(currentCalendarUrls) !== JSON.stringify(cachedCalendarUrls)
  ) {
    return { valid: false, reason: "calendar URLs changed" };
  }

  // Check calendar names match
  const currentCalendarNames = calendars
    .map((cal) => getCalendarName(cal))
    .sort();
  const cachedCalendarNames = (cacheData.calendarNames || []).sort();
  if (
    JSON.stringify(currentCalendarNames) !== JSON.stringify(cachedCalendarNames)
  ) {
    return { valid: false, reason: "calendar names changed" };
  }

  return { valid: true };
}

/**
 * Build cache data object for storage.
 */
export function buildCacheData(
  eventsByDate: Record<string, unknown[]>,
  calendars: Calendar[],
  eventCalendars: Map<string, string>,
  timestamp: number = Date.now(),
): CacheData {
  return {
    eventsByDate,
    eventCalendars: Object.fromEntries(eventCalendars),
    calendarUrls: calendars.map((cal) => cal.url).sort(),
    calendarNames: calendars.map((cal) => getCalendarName(cal)).sort(),
    timestamp,
    cacheVersion: CACHE_VERSION,
  };
}
