import { useEffect, useRef, useState } from "react";
import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { parseICS } from "node-ical";
import type { VEvent } from "node-ical";
import { Calendar } from "../types";
import { getCalendars, getCalendarName } from "../utils/calendar";
import { saveToCache, loadFromCache } from "../utils/cache";
import { isAllDayEvent, getDisplayStart } from "../utils/events";
import { CACHE_KEY } from "../constants";

export function useCalendarData(refreshInterval: number) {
  const [calendars, setCalendars] = useState<Calendar[]>(() => getCalendars());
  const [eventsByDate, setEventsByDate] = useState<Record<string, VEvent[]>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState<number>(0);

  const eventCalendarsRef = useRef(new Map<string, string>());

  const fetchCalendarData = async (forceRefresh = false) => {
    if (calendars.length === 0) {
      setEventsByDate({});
      setIsLoading(false);
      return;
    }

    // Try to load from cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await loadFromCache(calendars);
      if (cached) {
        setEventsByDate(cached.eventsByDate);
        eventCalendarsRef.current.clear();
        for (const [key, value] of Object.entries(cached.eventCalendars)) {
          eventCalendarsRef.current.set(key, value);
        }
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    const allEvents: VEvent[] = [];
    eventCalendarsRef.current.clear();

    try {
      for (const calendar of calendars) {
        try {
          const response = await fetch(calendar.url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const icsData = await response.text();
          const parsed = parseICS(icsData);

          // Extract events from the parsed iCal data
          for (const key in parsed) {
            const item = parsed[key];
            if (item.type === "VEVENT") {
              const startDate = new Date(item.start);

              // Only include future events
              if (startDate >= new Date()) {
                allEvents.push(item);
                eventCalendarsRef.current.set(item.uid, calendar.url);
              }
            }
          }
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

      // Group events by date
      const eventsByDate: Record<string, VEvent[]> = {};
      allEvents.sort((a, b) => {
        const aStart = new Date(a.start);
        const aEnd = new Date(a.end);
        const aIsAllDay = isAllDayEvent(aStart, aEnd);
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        const bIsAllDay = isAllDayEvent(bStart, bEnd);

        // All-day events come first
        if (aIsAllDay && !bIsAllDay) return -1;
        if (!aIsAllDay && bIsAllDay) return 1;

        // Both all-day or both timed: sort by time
        if (aIsAllDay && bIsAllDay) {
          return a.summary.localeCompare(b.summary);
        }

        // Both timed events
        const aDisplayStart = getDisplayStart(aStart, aIsAllDay);
        const bDisplayStart = getDisplayStart(bStart, bIsAllDay);
        return (
          new Date(
            aStart.toISOString().split("T")[0] + "T" + aDisplayStart,
          ).getTime() -
          new Date(
            bStart.toISOString().split("T")[0] + "T" + bDisplayStart,
          ).getTime()
        );
      });

      for (const event of allEvents) {
        const eventDate = new Date(event.start).toISOString().split("T")[0];
        if (!eventsByDate[eventDate]) {
          eventsByDate[eventDate] = [];
        }
        eventsByDate[eventDate].push(event);
      }

      setEventsByDate(eventsByDate);
      setLastRefresh(new Date());

      // Save to cache
      await saveToCache(eventsByDate, calendars, eventCalendarsRef.current);
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

  useEffect(() => {
    fetchCalendarData();

    // Set up refresh interval
    const interval = setInterval(
      () => fetchCalendarData(false),
      refreshInterval * 60 * 1000,
    );

    // Set up cache polling to detect changes from other commands
    const cacheCheckInterval = setInterval(() => {
      const currentCalendars = getCalendars();
      const currentUrlString = currentCalendars.map((cal) => cal.url).join(",");
      const stateUrlString = calendars.map((cal) => cal.url).join(",");
      const currentNameString = currentCalendars
        .map((cal) => getCalendarName(cal))
        .join(",");
      const stateNameString = calendars
        .map((cal) => getCalendarName(cal))
        .join(",");

      if (
        currentUrlString !== stateUrlString ||
        currentNameString !== stateNameString
      ) {
        setCalendars(currentCalendars);
        // Clear cache when calendars change
        LocalStorage.removeItem(CACHE_KEY);
        // Trigger refetch
        setRefetchTrigger((prev) => prev + 1);
      }
    }, 2000); // Check every 2 seconds

    return () => {
      clearInterval(interval);
      clearInterval(cacheCheckInterval);
    };
  }, [refreshInterval, refetchTrigger]);

  return {
    calendars,
    setCalendars,
    eventsByDate,
    isLoading,
    lastRefresh,
    eventCalendarsRef,
    refetch: () => fetchCalendarData(true),
  };
}