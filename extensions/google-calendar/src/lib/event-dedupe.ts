import type { GoogleEvent } from "../api/calendar";

export interface EventListItemData {
  event: GoogleEvent;
  calendarId: string;
  calendarName?: string;
  calendarColor?: string;
}

function eventStartMs(event: GoogleEvent): number {
  // Mirror `parseEventDate` in date-utils: a date-only start is a calendar
  // day, so anchor it at local midnight — `new Date("2026-10-14")` would be
  // UTC midnight (the previous local day west of UTC) and would mis-sort
  // all-day events against timed ones.
  const dateTime = event.start?.dateTime;
  if (typeof dateTime === "string" && dateTime.length > 0) {
    const ms = new Date(dateTime).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  const match = event.start?.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

export function compareEventsByStart(a: GoogleEvent, b: GoogleEvent): number {
  return eventStartMs(a) - eventStartMs(b);
}

/**
 * De-duplicate events appearing on several calendars.
 *
 * Two entries collapse ONLY when they are genuinely the same occurrence:
 * same `iCalUID` AND same start instant AND same `summary`. A bare
 * `iCalUID` match is not enough -- distinct occurrences (e.g. different
 * times after a "copy to calendar") must survive.
 *
 * When entries collapse, the copy belonging to the user's resolved default
 * calendar wins; the primary calendar is the fallback preference; otherwise
 * the first occurrence wins. Entries without an `iCalUID` never collapse
 * (keyed by `calendarId:event.id`).
 */
export function dedupeEvents(
  events: EventListItemData[],
  defaultCalendarId?: string,
  primaryCalendarId?: string,
): EventListItemData[] {
  const preferred = defaultCalendarId ?? primaryCalendarId;
  const byKey = new Map<string, EventListItemData>();
  for (const item of events) {
    const uid = item.event.iCalUID;
    const key =
      typeof uid === "string" && uid.length > 0
        ? [uid, String(eventStartMs(item.event)), item.event.summary ?? ""].join("\u001f")
        : [item.calendarId, item.event.id].join("\u001f");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const existingPreferred = preferred !== undefined && existing.calendarId === preferred;
    const incomingPreferred = preferred !== undefined && item.calendarId === preferred;
    if (incomingPreferred && !existingPreferred) {
      byKey.set(key, item);
      continue;
    }
    if (!existingPreferred && !incomingPreferred && primaryCalendarId) {
      if (item.calendarId === primaryCalendarId && existing.calendarId !== primaryCalendarId) {
        byKey.set(key, item);
      }
    }
  }
  return [...byKey.values()];
}
