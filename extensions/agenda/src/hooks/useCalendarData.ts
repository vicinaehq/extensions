import { useEffect, useState } from "react";
import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { parseICS } from "node-ical";
import type { VEvent } from "node-ical";
import { Calendar } from "../lib/types";
import { getCalendars } from "../lib/calendar";
import { saveToCache, loadFromCache } from "../lib/cache";
import {
  sortEvents,
  groupEventsByDate,
  calendarsChanged,
  isFutureEvent,
  processCalendarEvents,
} from "../lib/eventProcessing";
import { CACHE_KEY } from "../lib/constants";

export function useCalendarData(refreshInterval: number) {
  const [calendars, setCalendars] = useState<Calendar[]>(() => getCalendars());
  const [eventsByDate, setEventsByDate] = useState<Record<string, VEvent[]>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState<number>(0);
  const [eventCalendars, setEventCalendars] = useState(new Map<string, string>());

  const refreshFromNetwork = async (showLoading = false) => {
    if (calendars.length === 0) {
      setEventsByDate({});
      setIsLoading(false);
      return;
    }

    if (showLoading) setIsLoading(true);

    const allEvents: VEvent[] = [];
    const newEventCalendars = new Map<string, string>();

    try {
      for (const calendar of calendars) {
        try {
          const response = await fetch(calendar.url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const icsData = await response.text();
          const parsed = parseICS(icsData);
          const { events: calEvents, eventCalendars: calEventCalendars } =
            processCalendarEvents(parsed, calendar.url);

          for (const event of calEvents) allEvents.push(event);
          for (const [uid, url] of calEventCalendars) newEventCalendars.set(uid, url);
        } catch (error) {
          console.error(
            `Failed to fetch calendar from ${calendar.url}:`,
            error,
          );
          showToast({
            style: Toast.Style.Failure,
            title: "Failed to fetch calendar",
            message: `Error loading ${calendar.name || calendar.url}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      }

      const sortedEvents = sortEvents(allEvents);
      const grouped = groupEventsByDate(sortedEvents);

      setEventsByDate(grouped);
      setEventCalendars(newEventCalendars);
      setLastRefresh(new Date());

      await saveToCache(grouped, calendars, newEventCalendars);
    } catch (error) {
      console.error("Failed to fetch calendar data:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to fetch calendars",
        message: "Check your iCal URLs and network connection",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Returns the effective lastRefresh time after initialization:
  // either the cache timestamp (if fresh) or now (if a network refresh was performed).
  const loadCacheAndRefresh = async (): Promise<Date> => {
    if (calendars.length === 0) {
      setEventsByDate({});
      setIsLoading(false);
      return new Date();
    }

    const cached = await loadFromCache(calendars);
    if (cached) {
      const cachedEventCalendars = new Map<string, string>(
        Object.entries(cached.eventCalendars),
      );

      // Filter out events that have passed since the cache was saved so the
      // list is accurate immediately, before the network refresh completes.
      const now = new Date();
      const filteredEventsByDate: Record<string, VEvent[]> = {};
      for (const [date, events] of Object.entries(cached.eventsByDate)) {
        const upcoming = events.filter((e) => isFutureEvent(e, now));
        if (upcoming.length > 0) filteredEventsByDate[date] = upcoming;
      }

      setEventsByDate(filteredEventsByDate);
      setEventCalendars(cachedEventCalendars);
      setLastRefresh(cached.lastRefresh);
      setIsLoading(false);
    }

    // Only refresh from network if cache is missing or stale.
    const cacheAge = cached ? Date.now() - cached.lastRefresh.getTime() : Infinity;
    const refreshIntervalMs = refreshInterval * 60 * 1000;
    if (cacheAge >= refreshIntervalMs) {
      await refreshFromNetwork(cached === null);
      return new Date();
    }

    return cached!.lastRefresh;
  };

  useEffect(() => {
    const refreshIntervalMs = refreshInterval * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      intervalId = setInterval(() => refreshFromNetwork(false), refreshIntervalMs);
    };

    loadCacheAndRefresh().then((lastRefreshTime) => {
      // Schedule the first refresh to fire at the right time relative to the
      // last successful fetch, not relative to when the extension was opened.
      const elapsed = Date.now() - lastRefreshTime.getTime();
      const delay = Math.max(0, refreshIntervalMs - elapsed);

      timeoutId = setTimeout(() => {
        refreshFromNetwork(false);
        startInterval();
      }, delay);
    });

    const cacheCheckInterval = setInterval(() => {
      const currentCalendars = getCalendars();
      if (calendarsChanged(currentCalendars, calendars)) {
        setCalendars(currentCalendars);
        LocalStorage.removeItem(CACHE_KEY);
        setRefetchTrigger((prev) => prev + 1);
      }
    }, 2000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      clearInterval(cacheCheckInterval);
    };
  }, [refreshInterval, refetchTrigger]);

  return {
    calendars,
    setCalendars,
    eventsByDate,
    isLoading,
    lastRefresh,
    eventCalendars,
    refetch: () => refreshFromNetwork(true),
  };
}
