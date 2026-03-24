import { LocalStorage } from "@vicinae/api";
import type { VEvent } from "node-ical";
import { CACHE_KEY } from "./constants";
import { Calendar } from "./types";
import { validateCache, buildCacheData } from "./cacheValidation";

export const saveToCache = async (
  eventsByDate: Record<string, VEvent[]>,
  calendars: Calendar[],
  eventCalendars: Map<string, string>,
) => {
  const cacheData = buildCacheData(eventsByDate, calendars, eventCalendars);
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
      const validation = validateCache(cacheData, calendars);

      if (validation.valid) {
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
