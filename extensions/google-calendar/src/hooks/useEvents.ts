import { useState, useEffect, useCallback } from "react";
import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { googleCalendarAPI } from "../lib/google-api";
import { CalendarEvent, CacheEntry } from "../types";

const CACHE_KEY_PREFIX = "google-calendar-events-";
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for fetching and caching calendar events
 *
 * Features:
 * - Automatic caching with 5-minute duration
 * - Background refresh when using cached data
 * - Manual refresh capability
 * - Per-calendar caching
 */
export function useEvents(calendarId: string = "primary") {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  /**
   * Fetch events from API and update state
   */
  const fetchEvents = useCallback(async (showLoadingState: boolean, showSuccessToast: boolean) => {
    try {
      if (showLoadingState) {
        setIsLoading(true);
        setError(null);
      }

      const fetchedEvents = await googleCalendarAPI.listEvents(calendarId, { maxResults: 50 });
      setEvents(fetchedEvents);
      setLastFetch(new Date());
      await cacheEvents(calendarId, fetchedEvents);

      if (showSuccessToast) {
        await showToast({
          style: Toast.Style.Success,
          title: "Events Refreshed",
          message: `Loaded ${fetchedEvents.length} events`,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);

      if (showLoadingState) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to Load Events",
          message: errorMessage,
        });
      }
    } finally {
      if (showLoadingState) {
        setIsLoading(false);
      }
    }
  }, [calendarId]);

  /**
   * Manual refresh - clears cache and shows toast
   */
  const refresh = useCallback(() => {
    return fetchEvents(true, true);
  }, [fetchEvents]);

  // Load events on mount and when calendar changes
  useEffect(() => {
    async function loadEvents() {
      // Try cache first
      const cached = await loadFromCache(calendarId);
      if (cached) {
        setEvents(cached);
        setIsLoading(false);
        // Fetch fresh data in background
        fetchEvents(false, false);
      } else {
        // No cache - fetch with loading state
        await fetchEvents(true, false);
      }
    }

    loadEvents();
  }, [calendarId, fetchEvents]);

  return {
    events,
    isLoading,
    error,
    refresh,
    lastFetch,
  };
}

/**
 * Load events from LocalStorage cache
 */
async function loadFromCache(calendarId: string): Promise<CalendarEvent[] | null> {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${calendarId}`;
    const cached = await LocalStorage.getItem<string>(cacheKey);
    if (!cached) return null;

    const cacheEntry: CacheEntry<CalendarEvent[]> = JSON.parse(cached);

    // Check if cache is still valid
    if (Date.now() - cacheEntry.timestamp > CACHE_DURATION_MS) {
      return null;
    }

    // Parse dates back to Date objects
    return cacheEntry.data.map((event) => ({
      ...event,
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
    }));
  } catch (error) {
    console.error("Failed to load from cache:", error);
    return null;
  }
}

/**
 * Cache events to LocalStorage
 */
async function cacheEvents(calendarId: string, events: CalendarEvent[]): Promise<void> {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${calendarId}`;
    const cacheEntry: CacheEntry<CalendarEvent[]> = {
      data: events,
      timestamp: Date.now(),
    };
    await LocalStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
  } catch (error) {
    console.error("Failed to cache events:", error);
  }
}
