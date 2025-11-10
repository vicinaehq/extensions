import { LocalStorage } from "@vicinae/api";
import type { VEvent } from "node-ical";
import { CACHE_KEY, CACHE_DURATION, CACHE_VERSION } from "../constants";
import { Calendar } from "../types";
import { getCalendarName } from "./calendar";

export const saveToCache = async (
  eventsByDate: Record<string, VEvent[]>,
  calendars: Calendar[],
  eventCalendars: Map<string, string>,
) => {
  const cacheData = {
    eventsByDate,
    eventCalendars: Object.fromEntries(eventCalendars),
    calendarUrls: calendars.map((cal) => cal.url).sort(),
    calendarNames: calendars.map((cal) => getCalendarName(cal)).sort(),
    timestamp: Date.now(),
    cacheVersion: CACHE_VERSION,
  };
  await LocalStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
};

export const loadFromCache = async (
  calendars: Calendar[],
): Promise<{
  eventsByDate: Record<string, VEvent[]>;
  eventCalendars: Record<string, string>;
} | null> => {
  try {
    const cached = await LocalStorage.getItem(CACHE_KEY);
    if (typeof cached === "string") {
      const cacheData = JSON.parse(cached);
      const now = Date.now();
      const currentCalendarUrls = calendars.map((cal) => cal.url).sort();
      const cachedCalendarUrls = cacheData.calendarUrls || [];
      const currentCalendarNames = calendars
        .map((cal) => getCalendarName(cal))
        .sort();
      const cachedCalendarNames = cacheData.calendarNames || [];
      // Check if cache is still valid (within time limit and calendars haven't changed)
      if (
        now - cacheData.timestamp < CACHE_DURATION &&
        cacheData.eventCalendars &&
        cacheData.cacheVersion === CACHE_VERSION &&
        JSON.stringify(currentCalendarUrls) ===
          JSON.stringify(cachedCalendarUrls) &&
        JSON.stringify(currentCalendarNames) ===
          JSON.stringify(cachedCalendarNames)
      ) {
        return {
          eventsByDate: cacheData.eventsByDate,
          eventCalendars: cacheData.eventCalendars,
        };
      }
    }
  } catch (error) {
    console.error("Failed to load cache:", error);
  }
  return null;
};