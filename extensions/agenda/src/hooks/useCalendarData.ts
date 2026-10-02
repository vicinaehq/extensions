import { useEffect, useRef, useState } from "react";
import { LocalStorage, showToast, Toast } from "@vicinae/api";
import { parseICS } from "node-ical";
import type { CalendarResponse, VEvent } from "node-ical";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Calendar } from "../lib/types";
import { getCalendars } from "../lib/calendar";
import type { LoadCalendarsResult } from "../lib/calendar";
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
import { isLocalPath, expandPath } from "../lib/localPath";
import { toastLoadError, nextLoadErrorKey } from "../lib/toastLoadError";

async function fetchICSData(url: string): Promise<CalendarResponse> {
  if (isLocalPath(url)) {
    const dirPath = expandPath(url);
    const entries = await readdir(dirPath);
    const icsFiles = entries.filter((f) => f.endsWith(".ics"));

    if (icsFiles.length === 0) {
      throw new Error(`No .ics files found in ${dirPath}`);
    }

    const merged: CalendarResponse = {};
    for (const file of icsFiles) {
      const content = await readFile(join(dirPath, file), "utf-8");
      const parsed = parseICS(content);
      Object.assign(merged, parsed);
    }
    return merged;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const icsData = await response.text();
  return parseICS(icsData);
}

export function useCalendarData(refreshInterval: number) {
  const [loadResult] = useState<LoadCalendarsResult>(() => getCalendars());
  const [calendars, setCalendars] = useState<Calendar[]>(
    loadResult.ok ? loadResult.calendars : [],
  );
  const [eventsByDate, setEventsByDate] = useState<Record<string, VEvent[]>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState<number>(0);

  const eventCalendarsRef = useRef(new Map<string, string>());
  const lastToastedErrorKey = useRef<string | null>(null);

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
          const parsed = await fetchICSData(calendar.url);

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
    // Surface any initial load error, then let the poll below continue to
    // monitor the file. `loadResult` is stable for the lifetime of the hook.
    const initialKey = nextLoadErrorKey(lastToastedErrorKey.current, loadResult);
    if (initialKey !== null && initialKey !== lastToastedErrorKey.current) {
      lastToastedErrorKey.current = initialKey;
      if (!loadResult.ok) toastLoadError(loadResult.error);
    }

    fetchCalendarData();

    const interval = setInterval(
      () => fetchCalendarData(false),
      refreshInterval * 60 * 1000,
    );

    const cacheCheckInterval = setInterval(() => {
      const current = getCalendars();
      const key = nextLoadErrorKey(lastToastedErrorKey.current, current);
      if (key !== null && key !== lastToastedErrorKey.current) {
        lastToastedErrorKey.current = key;
        if (!current.ok) toastLoadError(current.error);
      }
      if (current.ok && calendarsChanged(current.calendars, calendars)) {
        setCalendars(current.calendars);
        LocalStorage.removeItem(CACHE_KEY);
        setRefetchTrigger((prev) => prev + 1);
      } else if (!current.ok) {
        setCalendars([]);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      clearInterval(cacheCheckInterval);
    };
  }, [refreshInterval, refetchTrigger, loadResult]);

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
