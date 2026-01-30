import { useEffect, useRef, useState } from "react";
import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { parseICS } from "node-ical";
import type { VEvent } from "node-ical";
import { Calendar } from "../types";
import { getCalendars, getCalendarName } from "../utils/calendar";
import { saveToCache, loadFromCache } from "../utils/cache";
import { isAllDayEvent, getDisplayStart, getLocalDateString } from "../utils/events";
import { CACHE_KEY } from "../constants";

export function useCalendarData(refreshInterval: number) {
  const [calendars, setCalendars] = useState<Calendar[]>(() => getCalendars());
  const [eventsByDate, setEventsByDate] = useState<Record<string, VEvent[]>>(
    {}
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
              // Handle recurring events
              if (item.rrule) {
                const rangeStart = new Date();
                const rangeEnd = new Date();
                rangeEnd.setMonth(rangeEnd.getMonth() + 1);

                const occurrences = item.rrule.between(
                  rangeStart,
                  rangeEnd,
                  true
                );

                for (const occurrenceStart of occurrences) {
                  const occurrenceStartDate = new Date(occurrenceStart) as any;
                  occurrenceStartDate.tz = item.start.tz; // Copy timezone from original event
                  const durationMs = item.end.getTime() - item.start.getTime();
                  const occurrenceEndDate = new Date(
                    occurrenceStartDate.getTime() + durationMs
                  ) as any;
                  occurrenceEndDate.tz = item.end.tz; // Copy timezone from original event

                  // Create a new event instance for this occurrence
                  const occurrenceEvent = {
                    ...item,
                    start: occurrenceStartDate,
                    end: occurrenceEndDate,
                    uid: `${item.uid}_${getLocalDateString(occurrenceStartDate)}`, // Make UID unique for each occurrence
                    recurrenceId: occurrenceStartDate,
                  };

                  allEvents.push(occurrenceEvent as VEvent);
                  eventCalendarsRef.current.set(
                    occurrenceEvent.uid,
                    calendar.url
                  );
                }
              } else {
                // Handle non-recurring events
                const startDate = new Date(item.start);

                // Only include future events
                if (startDate >= new Date()) {
                  allEvents.push(item);
                  eventCalendarsRef.current.set(item.uid, calendar.url);
                }
              }
            }
          }
        } catch (error) {
          console.error(
            `Failed to fetch calendar from ${calendar.url}:`,
            error
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

        // Both timed events - sort by actual start time
        return aStart.getTime() - bStart.getTime();
      });

      for (const event of allEvents) {
        // Use local date to prevent timezone-related day shift issues
        const eventDate = getLocalDateString(new Date(event.start));
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
      refreshInterval * 60 * 1000
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
