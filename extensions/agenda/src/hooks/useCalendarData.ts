import { useEffect, useRef, useState } from "react";
import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { parseICS } from "node-ical";
import type { VEvent } from "node-ical";
import { Calendar } from "../lib/types";
import { getCalendars } from "../lib/calendar";
import { saveToCache, loadFromCache } from "../lib/cache";
import {
  sortEvents,
  groupEventsByDate,
  convertRruleDate,
  calendarsChanged,
  isFutureEvent,
  createOccurrenceUid,
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

  const eventCalendarsRef = useRef(new Map<string, string>());

  const fetchCalendarData = async (forceRefresh = false) => {
    if (calendars.length === 0) {
      setEventsByDate({});
      setIsLoading(false);
      return;
    }

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

          for (const key in parsed) {
            const item = parsed[key];
            if (item.type === "VEVENT") {
              if (item.rrule) {
                const rangeStart = new Date();
                const rangeEnd = new Date();
                rangeEnd.setMonth(rangeEnd.getMonth() + 1);

                const occurrences = item.rrule.between(
                  rangeStart,
                  rangeEnd,
                  true,
                );

                for (const occurrenceStart of occurrences) {
                  const occurrenceStartDate = convertRruleDate(
                    new Date(occurrenceStart),
                  ) as typeof item.start;
                  const durationMs = item.end.getTime() - item.start.getTime();
                  const occurrenceEndDate = new Date(
                    occurrenceStartDate.getTime() + durationMs,
                  ) as typeof item.end;

                  const occurrenceEvent = {
                    ...item,
                    start: occurrenceStartDate,
                    end: occurrenceEndDate,
                    uid: createOccurrenceUid(item.uid, occurrenceStartDate),
                    recurrenceId: occurrenceStartDate,
                  };

                  allEvents.push(occurrenceEvent as VEvent);
                  eventCalendarsRef.current.set(
                    occurrenceEvent.uid,
                    calendar.url,
                  );
                }
              } else {
                if (isFutureEvent(item)) {
                  allEvents.push(item);
                  eventCalendarsRef.current.set(item.uid, calendar.url);
                }
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

      const sortedEvents = sortEvents(allEvents);
      const grouped = groupEventsByDate(sortedEvents);

      setEventsByDate(grouped);
      setLastRefresh(new Date());

      await saveToCache(grouped, calendars, eventCalendarsRef.current);
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

    const interval = setInterval(
      () => fetchCalendarData(false),
      refreshInterval * 60 * 1000,
    );

    const cacheCheckInterval = setInterval(() => {
      const currentCalendars = getCalendars();
      if (calendarsChanged(currentCalendars, calendars)) {
        setCalendars(currentCalendars);
        LocalStorage.removeItem(CACHE_KEY);
        setRefetchTrigger((prev) => prev + 1);
      }
    }, 2000);

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
