import { describe, it, expect } from "vitest";
import {
  CalendarAuthStatus,
  MacOSRawEvent,
  hasMacOSAccess,
  normalizeAllDayBounds,
  toAgendaEvent,
} from "./macosCalendar";
import { isAllDayEvent } from "./events";

const rawEvent = (overrides: Partial<MacOSRawEvent> = {}): MacOSRawEvent => ({
  id: "event-1",
  title: "Standup",
  start: new Date(2026, 9, 1, 9, 0).getTime(),
  end: new Date(2026, 9, 1, 9, 30).getTime(),
  allDay: false,
  location: "Office",
  notes: "Daily sync",
  url: "https://meet.example.com/abc",
  calendarId: "cal-1",
  ...overrides,
});

describe("macosCalendar", () => {
  describe("hasMacOSAccess", () => {
    it("is true for authorized and full access", () => {
      expect(hasMacOSAccess(CalendarAuthStatus.Authorized)).toBe(true);
      expect(hasMacOSAccess(CalendarAuthStatus.FullAccess)).toBe(true);
    });

    it("is false otherwise", () => {
      expect(hasMacOSAccess(CalendarAuthStatus.NotDetermined)).toBe(false);
      expect(hasMacOSAccess(CalendarAuthStatus.Denied)).toBe(false);
      expect(hasMacOSAccess(CalendarAuthStatus.Restricted)).toBe(false);
    });
  });

  describe("normalizeAllDayBounds", () => {
    it("snaps to local midnight with an exclusive next-day end", () => {
      const { start, end } = normalizeAllDayBounds(
        new Date(2026, 9, 1, 13, 45).getTime(),
        new Date(2026, 9, 2).getTime(),
      );

      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getDate()).toBe(1);
      expect(end.getDate()).toBe(2);
      expect(end.getHours()).toBe(0);
    });

    it("preserves the full span of a multi-day event", () => {
      const { start, end } = normalizeAllDayBounds(
        new Date(2026, 9, 1, 13, 45).getTime(),
        new Date(2026, 9, 4, 11, 30).getTime(),
      );

      expect(start.getDate()).toBe(1);
      expect(end.getDate()).toBe(4);
      expect(end.getHours()).toBe(0);
    });

    it("falls back to a single day when the end is not after the start", () => {
      const { start, end } = normalizeAllDayBounds(
        new Date(2026, 9, 1).getTime(),
        new Date(2026, 9, 1).getTime(),
      );

      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe("toAgendaEvent", () => {
    it("maps a timed event onto the shared event shape", () => {
      const event = toAgendaEvent(rawEvent(), "fallback");

      expect(event.uid).toBe("event-1");
      expect(event.summary).toBe("Standup");
      expect(new Date(event.start).getHours()).toBe(9);
      expect(new Date(event.end).getMinutes()).toBe(30);
      expect(event.location).toBe("Office");
      expect(event.description).toBe("Daily sync");
      expect(event.url).toBe("https://meet.example.com/abc");
    });

    it("falls back to the provided uid when EventKit has none", () => {
      const event = toAgendaEvent(rawEvent({ id: null }), "cal-1-123");
      expect(event.uid).toBe("cal-1-123");
    });

    it("falls back to a placeholder title when empty", () => {
      const event = toAgendaEvent(rawEvent({ title: null }), "fallback");
      expect(event.summary).toBe("Untitled Event");
    });

    it("normalizes all-day events so they are detected as all-day", () => {
      const event = toAgendaEvent(
        rawEvent({
          allDay: true,
          start: new Date(2026, 9, 1, 0, 0).getTime(),
          end: new Date(2026, 9, 2, 0, 0).getTime(),
          title: "Holiday",
        }),
        "fallback",
      );

      expect(isAllDayEvent(new Date(event.start), new Date(event.end))).toBe(
        true,
      );
    });

    it("keeps the full span of multi-day all-day events", () => {
      const event = toAgendaEvent(
        rawEvent({
          allDay: true,
          start: new Date(2026, 9, 1, 0, 0).getTime(),
          end: new Date(2026, 9, 4, 0, 0).getTime(),
          title: "Conference",
        }),
        "fallback",
      );

      expect(new Date(event.start).getDate()).toBe(1);
      expect(new Date(event.end).getDate()).toBe(4);
      expect(isAllDayEvent(new Date(event.start), new Date(event.end))).toBe(
        true,
      );
    });
  });
});
