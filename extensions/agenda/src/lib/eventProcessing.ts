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
 */
export function groupEventsByDate<T extends EventLike>(
  events: T[],
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};

  for (const event of events) {
    const eventDate = getLocalDateString(new Date(event.start as Date));
    if (!grouped[eventDate]) {
      grouped[eventDate] = [];
    }
    grouped[eventDate].push(event);
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
 * Check if an event is in the future (starts after the reference date).
 */
export function isFutureEvent(
  event: EventLike,
  referenceDate: Date = new Date(),
): boolean {
  const startDate = new Date(event.start as Date);
  return startDate >= referenceDate;
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
