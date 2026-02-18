import { useState, useEffect } from "react";
import { LocalStorage } from "@vicinae/api";
import { googleCalendarAPI } from "../lib/google-api";
import { Calendar, CacheEntry } from "../types";

const CACHE_KEY = "google-calendar-calendars-list";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const SELECTED_CALENDAR_KEY = "google-calendar-selected-calendar";

/**
 * Hook for fetching and caching calendar list
 *
 * Features:
 * - 24-hour cache (calendars don't change frequently)
 * - Persistent calendar selection
 * - Automatic primary calendar resolution
 */
export function useCalendars() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");

  // Load calendars from cache or API
  useEffect(() => {
    async function loadCalendars() {
      try {
        setIsLoading(true);

        // Try cache first
        const cached = await loadFromCache();
        const fetchedCalendars = cached || await googleCalendarAPI.listCalendars();

        setCalendars(fetchedCalendars);

        // Cache if we fetched from API
        if (!cached) {
          await cacheCalendars(fetchedCalendars);
        }

        // Load saved calendar selection or default to primary
        const savedSelection = await LocalStorage.getItem<string>(SELECTED_CALENDAR_KEY);
        const primary = fetchedCalendars.find((cal) => cal.primary);

        if (savedSelection && fetchedCalendars.some((cal) => cal.id === savedSelection)) {
          // Use saved selection if it still exists
          setSelectedCalendarId(savedSelection);
        } else if (primary) {
          // Default to primary calendar
          setSelectedCalendarId(primary.id);
        } else if (fetchedCalendars.length > 0) {
          // Fallback to first calendar
          setSelectedCalendarId(fetchedCalendars[0].id);
        }
      } catch (error) {
        console.error("Failed to load calendars:", error);
        setCalendars([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadCalendars();
  }, []);

  // Save selected calendar whenever it changes
  useEffect(() => {
    if (selectedCalendarId) {
      LocalStorage.setItem(SELECTED_CALENDAR_KEY, selectedCalendarId).catch(console.error);
    }
  }, [selectedCalendarId]);

  return {
    calendars,
    isLoading,
    selectedCalendarId,
    setSelectedCalendarId,
  };
}

/**
 * Load calendars from LocalStorage cache
 */
async function loadFromCache(): Promise<Calendar[] | null> {
  try {
    const cached = await LocalStorage.getItem<string>(CACHE_KEY);
    if (!cached) return null;

    const cacheEntry: CacheEntry<Calendar[]> = JSON.parse(cached);

    // Check if cache is still valid
    if (Date.now() - cacheEntry.timestamp > CACHE_DURATION_MS) {
      return null;
    }

    return cacheEntry.data;
  } catch (error) {
    console.error("Failed to load calendars from cache:", error);
    return null;
  }
}

/**
 * Cache calendars to LocalStorage
 */
async function cacheCalendars(calendars: Calendar[]): Promise<void> {
  try {
    const cacheEntry: CacheEntry<Calendar[]> = {
      data: calendars,
      timestamp: Date.now(),
    };
    await LocalStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
  } catch (error) {
    console.error("Failed to cache calendars:", error);
  }
}
