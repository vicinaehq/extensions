import type { CalendarResponse, VEvent } from "node-ical";
import { isAllDayEvent, getLocalDateString } from "./events";
import { getCalendarName } from "./calendar";
import { Calendar } from "./types";

/**
 * Event with start/end dates for sorting/grouping
 */
export interface EventLike {
  start: Date | { getTime(): number };
  end: Date | { getTime(): number };
  summary: string;
  uid: string;
}

/**
 * Sort events: all-day events first, then by start time.
 * All-day events are sorted alphabetically by summary.
 */
export function sortEvents<T extends EventLike>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const aStart = new Date(a.start as Date);
    const aEnd = new Date(a.end as Date);
    const aIsAllDay = isAllDayEvent(aStart, aEnd);
    const bStart = new Date(b.start as Date);
    const bEnd = new Date(b.end as Date);
    const bIsAllDay = isAllDayEvent(bStart, bEnd);

    // All-day events come first
    if (aIsAllDay && !bIsAllDay) return -1;
    if (!aIsAllDay && bIsAllDay) return 1;

    // Both all-day: sort alphabetically by summary
    if (aIsAllDay && bIsAllDay) {
      return a.summary.localeCompare(b.summary);
    }

    // Both timed events: sort by start time
    return aStart.getTime() - bStart.getTime();
  });
}

/**
 * Group events by their local date (YYYY-MM-DD).
 * Multi-day all-day events are added to each date they span.
 */
export function groupEventsByDate<T extends EventLike>(
  events: T[],
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};

  for (const event of events) {
    const startDate = new Date(event.start as Date);
    const endDate = new Date(event.end as Date);

    if (isAllDayEvent(startDate, endDate)) {
      // Expand multi-day all-day events across each date they span
      const current = new Date(startDate);
      while (current < endDate) {
        const dateKey = getLocalDateString(current);
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(event);
        current.setDate(current.getDate() + 1);
      }
    } else {
      const dateKey = getLocalDateString(startDate);
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(event);
    }
  }

  return grouped;
}

/**
 * Convert rrule date to local time.
 * rrule.between() returns dates where wall clock time is stored in UTC position.
 * This converts by treating UTC values as local time values.
 */
export function convertRruleDate(rruleDate: Date): Date {
  return new Date(
    rruleDate.getUTCFullYear(),
    rruleDate.getUTCMonth(),
    rruleDate.getUTCDate(),
    rruleDate.getUTCHours(),
    rruleDate.getUTCMinutes(),
    rruleDate.getUTCSeconds(),
  );
}

/**
 * Check if two calendar arrays have different content.
 * Compares by URL and name.
 */
export function calendarsChanged(a: Calendar[], b: Calendar[]): boolean {
  if (a.length !== b.length) return true;

  const aUrls = a
    .map((cal) => cal.url)
    .sort()
    .join(",");
  const bUrls = b
    .map((cal) => cal.url)
    .sort()
    .join(",");
  if (aUrls !== bUrls) return true;

  const aNames = a
    .map((cal) => getCalendarName(cal))
    .sort()
    .join(",");
  const bNames = b
    .map((cal) => getCalendarName(cal))
    .sort()
    .join(",");
  return aNames !== bNames;
}

/**
 * Check if an event is upcoming relative to the reference date.
 * For all-day events, compares by end date so that ongoing multi-day events
 * remain visible until their last day passes. For timed events, includes
 * in-progress events by checking the end time.
 */
export function isFutureEvent(
  event: EventLike,
  referenceDate: Date = new Date(),
): boolean {
  const startDate = new Date(event.start as Date);
  const endDate = new Date(event.end as Date);

  if (isAllDayEvent(startDate, endDate)) {
    return getLocalDateString(endDate) > getLocalDateString(referenceDate);
  }

  return endDate > referenceDate;
}

/**
 * Create a unique ID for a recurring event occurrence.
 */
export function createOccurrenceUid(
  baseUid: string,
  occurrenceDate: Date,
): string {
  return `${baseUid}_${getLocalDateString(occurrenceDate)}`;
}

/**
 * Process a parsed iCal feed into a filtered list of upcoming events.
 *
 * For recurring events:
 * - rangeStart is midnight today (wall-clock UTC) so in-progress occurrences
 *   are included in the rrule expansion; isFutureEvent then filters out
 *   occurrences that have already ended.
 * - RECURRENCE-ID overrides within the expansion range replace the original
 *   occurrence with the rescheduled time.
 * - Overrides whose original occurrence fell before rangeStart are caught by a
 *   secondary sweep of item.recurrences.
 *
 * @param now - Reference time; defaults to the current time.
 */
export function processCalendarEvents(
  parsed: CalendarResponse,
  calendarUrl: string,
  now: Date = new Date(),
): { events: VEvent[]; eventCalendars: Map<string, string> } {
  const events: VEvent[] = [];
  const eventCalendars = new Map<string, string>();

  for (const key in parsed) {
    const item = parsed[key];
    if (item.type !== "VEVENT") continue;

    if (item.rrule) {
      // rrule.between() uses "wall clock in UTC" representation, so we must
      // convert to that format (local time stored in UTC position) to get
      // correct results for non-UTC timezones.
      // rangeStart is midnight today so in-progress events (started earlier
      // today) are included; isFutureEvent below filters out ended ones.
      const rangeStart = new Date(Date.UTC(
        now.getFullYear(), now.getMonth(), now.getDate(),
        0, 0, 0,
      ));
      const rangeEnd = new Date(Date.UTC(
        now.getFullYear(), now.getMonth(), now.getDate(),
        now.getHours(), now.getMinutes(), now.getSeconds(),
      ));
      rangeEnd.setUTCMonth(rangeEnd.getUTCMonth() + 1);

      const occurrences = item.rrule.between(rangeStart, rangeEnd, true);

      // Track covered date keys so the sweep below can find uncovered overrides.
      const rruleDateKeys = new Set<string>(
        occurrences.map((occ) => new Date(occ).toISOString().slice(0, 10)),
      );

      for (const occurrenceStart of occurrences) {
        // node-ical keys recurrences by the UTC date of the original occurrence
        // (RECURRENCE-ID.toISOString().slice(0, 10)).
        const occurrenceDateKey = new Date(occurrenceStart)
          .toISOString()
          .slice(0, 10);
        const override = item.recurrences?.[occurrenceDateKey];

        if (override) {
          // This occurrence was rescheduled; use the override's times.
          if (isFutureEvent(override, now)) {
            const overrideEvent = {
              ...override,
              uid: createOccurrenceUid(item.uid, new Date(override.start as Date)),
            };
            events.push(overrideEvent as VEvent);
            eventCalendars.set(overrideEvent.uid, calendarUrl);
          }
        } else {
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

          if (isFutureEvent(occurrenceEvent, now)) {
            events.push(occurrenceEvent as VEvent);
            eventCalendars.set(occurrenceEvent.uid, calendarUrl);
          }
        }
      }

      // Sweep overrides whose original occurrence fell outside the rrule
      // expansion window (e.g. original was before rangeStart but the
      // rescheduled time is in the future).
      if (item.recurrences) {
        for (const [dateKey, override] of Object.entries(item.recurrences)) {
          if (!rruleDateKeys.has(dateKey) && isFutureEvent(override, now)) {
            const overrideEvent = {
              ...override,
              uid: createOccurrenceUid(item.uid, new Date(override.start as Date)),
            };
            events.push(overrideEvent as VEvent);
            eventCalendars.set(overrideEvent.uid, calendarUrl);
          }
        }
      }
    } else {
      if (isFutureEvent(item, now)) {
        events.push(item);
        eventCalendars.set(item.uid, calendarUrl);
      }
    }
  }

  return { events, eventCalendars };
}
