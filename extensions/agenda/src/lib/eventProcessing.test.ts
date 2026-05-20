import { describe, it, expect } from "vitest";
import { parseICS } from "node-ical";
import {
  sortEvents,
  groupEventsByDate,
  convertRruleDate,
  calendarsChanged,
  isFutureEvent,
  createOccurrenceUid,
  processCalendarEvents,
} from "./eventProcessing";

describe("eventProcessing", () => {
  describe("sortEvents", () => {
    describe("given a mix of all-day and timed events", () => {
      const events = [
        {
          uid: "timed-1",
          summary: "Meeting",
          start: new Date(2024, 0, 15, 14, 0),
          end: new Date(2024, 0, 15, 15, 0),
        },
        {
          uid: "all-day-1",
          summary: "Holiday",
          start: new Date(2024, 0, 15, 0, 0, 0),
          end: new Date(2024, 0, 16, 0, 0, 0),
        },
        {
          uid: "timed-2",
          summary: "Standup",
          start: new Date(2024, 0, 15, 9, 0),
          end: new Date(2024, 0, 15, 9, 30),
        },
      ];

      describe("when sorting events", () => {
        it("then all-day events come first", () => {
          const sorted = sortEvents(events);
          expect(sorted[0].uid).toBe("all-day-1");
        });

        it("then timed events are sorted by start time", () => {
          const sorted = sortEvents(events);
          expect(sorted[1].uid).toBe("timed-2"); // 9:00
          expect(sorted[2].uid).toBe("timed-1"); // 14:00
        });
      });
    });

    describe("given multiple all-day events", () => {
      const events = [
        {
          uid: "all-day-b",
          summary: "Birthday",
          start: new Date(2024, 0, 15, 0, 0, 0),
          end: new Date(2024, 0, 16, 0, 0, 0),
        },
        {
          uid: "all-day-a",
          summary: "Anniversary",
          start: new Date(2024, 0, 15, 0, 0, 0),
          end: new Date(2024, 0, 16, 0, 0, 0),
        },
      ];

      describe("when sorting events", () => {
        it("then all-day events are sorted alphabetically by summary", () => {
          const sorted = sortEvents(events);
          expect(sorted[0].summary).toBe("Anniversary");
          expect(sorted[1].summary).toBe("Birthday");
        });
      });
    });

    describe("given only timed events", () => {
      const events = [
        {
          uid: "late",
          summary: "Dinner",
          start: new Date(2024, 0, 15, 19, 0),
          end: new Date(2024, 0, 15, 20, 0),
        },
        {
          uid: "early",
          summary: "Breakfast",
          start: new Date(2024, 0, 15, 8, 0),
          end: new Date(2024, 0, 15, 8, 30),
        },
        {
          uid: "mid",
          summary: "Lunch",
          start: new Date(2024, 0, 15, 12, 0),
          end: new Date(2024, 0, 15, 13, 0),
        },
      ];

      describe("when sorting events", () => {
        it("then events are sorted by start time ascending", () => {
          const sorted = sortEvents(events);
          expect(sorted[0].uid).toBe("early");
          expect(sorted[1].uid).toBe("mid");
          expect(sorted[2].uid).toBe("late");
        });
      });
    });

    describe("given an empty array", () => {
      describe("when sorting events", () => {
        it("then returns empty array", () => {
          expect(sortEvents([])).toEqual([]);
        });
      });
    });

    describe("given original array", () => {
      const events = [
        {
          uid: "1",
          summary: "A",
          start: new Date(2024, 0, 15, 14, 0),
          end: new Date(2024, 0, 15, 15, 0),
        },
      ];

      describe("when sorting events", () => {
        it("then does not mutate original array", () => {
          const original = [...events];
          sortEvents(events);
          expect(events).toEqual(original);
        });
      });
    });
  });

  describe("groupEventsByDate", () => {
    describe("given events on different dates", () => {
      const events = [
        {
          uid: "1",
          summary: "Event 1",
          start: new Date(2024, 0, 15, 10, 0),
          end: new Date(2024, 0, 15, 11, 0),
        },
        {
          uid: "2",
          summary: "Event 2",
          start: new Date(2024, 0, 16, 10, 0),
          end: new Date(2024, 0, 16, 11, 0),
        },
        {
          uid: "3",
          summary: "Event 3",
          start: new Date(2024, 0, 15, 14, 0),
          end: new Date(2024, 0, 15, 15, 0),
        },
      ];

      describe("when grouping events", () => {
        it("then groups by YYYY-MM-DD date string", () => {
          const grouped = groupEventsByDate(events);
          expect(Object.keys(grouped)).toHaveLength(2);
          expect(grouped["2024-01-15"]).toHaveLength(2);
          expect(grouped["2024-01-16"]).toHaveLength(1);
        });

        it("then preserves event order within groups", () => {
          const grouped = groupEventsByDate(events);
          expect(grouped["2024-01-15"][0].uid).toBe("1");
          expect(grouped["2024-01-15"][1].uid).toBe("3");
        });
      });
    });

    describe("given a multi-day all-day event", () => {
      const events = [
        {
          uid: "multi",
          summary: "Conference",
          start: new Date(2024, 0, 15, 0, 0, 0), // Jan 15 midnight
          end: new Date(2024, 0, 18, 0, 0, 0),   // Jan 18 midnight (3 days)
        },
      ];

      describe("when grouping events", () => {
        it("then appears in each day it spans", () => {
          const grouped = groupEventsByDate(events);
          expect(grouped["2024-01-15"]).toHaveLength(1);
          expect(grouped["2024-01-16"]).toHaveLength(1);
          expect(grouped["2024-01-17"]).toHaveLength(1);
          expect(grouped["2024-01-18"]).toBeUndefined();
        });

        it("then the same event object appears in each group", () => {
          const grouped = groupEventsByDate(events);
          expect(grouped["2024-01-15"][0].uid).toBe("multi");
          expect(grouped["2024-01-16"][0].uid).toBe("multi");
          expect(grouped["2024-01-17"][0].uid).toBe("multi");
        });
      });
    });

    describe("given an empty array", () => {
      describe("when grouping events", () => {
        it("then returns empty object", () => {
          expect(groupEventsByDate([])).toEqual({});
        });
      });
    });
  });

  describe("convertRruleDate", () => {
    describe("given an rrule date with UTC values representing local time", () => {
      // rrule stores 10:30 local as 10:30 UTC
      const rruleDate = new Date(Date.UTC(2024, 5, 15, 10, 30, 0));

      describe("when converting to local time", () => {
        it("then extracts UTC values as local time components", () => {
          const result = convertRruleDate(rruleDate);
          expect(result.getFullYear()).toBe(2024);
          expect(result.getMonth()).toBe(5); // June (0-indexed)
          expect(result.getDate()).toBe(15);
          expect(result.getHours()).toBe(10);
          expect(result.getMinutes()).toBe(30);
          expect(result.getSeconds()).toBe(0);
        });
      });
    });

    describe("given midnight UTC", () => {
      const rruleDate = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));

      describe("when converting", () => {
        it("then returns midnight local time", () => {
          const result = convertRruleDate(rruleDate);
          expect(result.getHours()).toBe(0);
          expect(result.getMinutes()).toBe(0);
        });
      });
    });

    describe("given end of day UTC", () => {
      const rruleDate = new Date(Date.UTC(2024, 11, 31, 23, 59, 59));

      describe("when converting", () => {
        it("then preserves all time components", () => {
          const result = convertRruleDate(rruleDate);
          expect(result.getFullYear()).toBe(2024);
          expect(result.getMonth()).toBe(11);
          expect(result.getDate()).toBe(31);
          expect(result.getHours()).toBe(23);
          expect(result.getMinutes()).toBe(59);
          expect(result.getSeconds()).toBe(59);
        });
      });
    });
  });

  describe("calendarsChanged", () => {
    it.each([
      {
        scenario: "identical calendars",
        a: [
          { url: "https://example.com/cal1", name: "Cal 1", color: "blue" },
          { url: "https://example.com/cal2", name: "Cal 2", color: "red" },
        ],
        b: [
          { url: "https://example.com/cal1", name: "Cal 1", color: "blue" },
          { url: "https://example.com/cal2", name: "Cal 2", color: "red" },
        ],
        expected: false,
      },
      {
        scenario: "same content in different order",
        a: [
          { url: "https://example.com/cal1", name: "Cal 1", color: "blue" },
          { url: "https://example.com/cal2", name: "Cal 2", color: "red" },
        ],
        b: [
          { url: "https://example.com/cal2", name: "Cal 2", color: "red" },
          { url: "https://example.com/cal1", name: "Cal 1", color: "blue" },
        ],
        expected: false,
      },
      {
        scenario: "different URLs",
        a: [{ url: "https://example.com/cal1", name: "Cal", color: "blue" }],
        b: [{ url: "https://example.com/cal2", name: "Cal", color: "blue" }],
        expected: true,
      },
      {
        scenario: "different names",
        a: [{ url: "https://example.com/cal", name: "Cal A", color: "blue" }],
        b: [{ url: "https://example.com/cal", name: "Cal B", color: "blue" }],
        expected: true,
      },
      {
        scenario: "different number of calendars",
        a: [{ url: "https://example.com/cal1", name: "Cal 1", color: "blue" }],
        b: [
          { url: "https://example.com/cal1", name: "Cal 1", color: "blue" },
          { url: "https://example.com/cal2", name: "Cal 2", color: "red" },
        ],
        expected: true,
      },
      {
        scenario: "empty arrays",
        a: [],
        b: [],
        expected: false,
      },
    ])("returns $expected given $scenario", ({ a, b, expected }) => {
      expect(calendarsChanged(a as any, b as any)).toBe(expected);
    });
  });

  describe("isFutureEvent", () => {
    describe("given an event that ends after reference date", () => {
      const event = {
        uid: "1",
        summary: "Future",
        start: new Date(2024, 6, 15, 10, 0),
        end: new Date(2024, 6, 15, 11, 0),
      };
      const referenceDate = new Date(2024, 6, 1);

      describe("when checking", () => {
        it("then returns true", () => {
          expect(isFutureEvent(event, referenceDate)).toBe(true);
        });
      });
    });

    describe("given an event that has already ended before reference date", () => {
      const event = {
        uid: "1",
        summary: "Past",
        start: new Date(2024, 5, 15, 10, 0),
        end: new Date(2024, 5, 15, 11, 0),
      };
      const referenceDate = new Date(2024, 6, 1);

      describe("when checking", () => {
        it("then returns false", () => {
          expect(isFutureEvent(event, referenceDate)).toBe(false);
        });
      });
    });

    describe("given an in-progress event (started before, ends after reference date)", () => {
      const referenceDate = new Date(2024, 6, 15, 10, 30);
      const event = {
        uid: "1",
        summary: "In Progress",
        start: new Date(2024, 6, 15, 10, 0),
        end: new Date(2024, 6, 15, 11, 0),
      };

      describe("when checking", () => {
        it("then returns true", () => {
          expect(isFutureEvent(event, referenceDate)).toBe(true);
        });
      });
    });

    describe("given an all-day event for today (starts at midnight, ends at midnight tomorrow)", () => {
      const referenceDate = new Date(2024, 6, 15, 14, 0); // 2pm today
      const event = {
        uid: "1",
        summary: "All Day Today",
        start: new Date(2024, 6, 15, 0, 0, 0), // midnight today
        end: new Date(2024, 6, 16, 0, 0, 0),   // midnight tomorrow
      };

      describe("when checking", () => {
        it("then returns true", () => {
          expect(isFutureEvent(event, referenceDate)).toBe(true);
        });
      });
    });

    describe("given an all-day event from yesterday (ends at midnight today)", () => {
      const referenceDate = new Date(2024, 6, 15, 14, 0); // 2pm today (July 15)
      const event = {
        uid: "1",
        summary: "Yesterday All Day",
        start: new Date(2024, 6, 14, 0, 0, 0), // midnight yesterday (July 14)
        end: new Date(2024, 6, 15, 0, 0, 0),   // midnight today (July 15)
      };

      describe("when checking", () => {
        it("then returns false", () => {
          expect(isFutureEvent(event, referenceDate)).toBe(false);
        });
      });
    });

    describe("given a multi-day all-day event spanning today", () => {
      const referenceDate = new Date(2024, 6, 15, 14, 0); // 2pm today (July 15)
      const event = {
        uid: "1",
        summary: "Multi Day",
        start: new Date(2024, 6, 14, 0, 0, 0), // started yesterday (July 14)
        end: new Date(2024, 6, 17, 0, 0, 0),   // ends July 17
      };

      describe("when checking", () => {
        it("then returns true (event is still ongoing)", () => {
          expect(isFutureEvent(event, referenceDate)).toBe(true);
        });
      });
    });

    describe("given an event ending exactly at reference date", () => {
      const referenceDate = new Date(2024, 6, 15, 11, 0);
      const event = {
        uid: "1",
        summary: "Just Ended",
        start: new Date(2024, 6, 15, 10, 0),
        end: new Date(2024, 6, 15, 11, 0),
      };

      describe("when checking", () => {
        it("then returns false (exclusive boundary)", () => {
          expect(isFutureEvent(event, referenceDate)).toBe(false);
        });
      });
    });
  });

  describe("createOccurrenceUid", () => {
    describe("given a base UID and occurrence date", () => {
      const baseUid = "event-123";
      const occurrenceDate = new Date(2024, 5, 15);

      describe("when creating occurrence UID", () => {
        it("then combines base UID with date string", () => {
          const result = createOccurrenceUid(baseUid, occurrenceDate);
          expect(result).toBe("event-123_2024-06-15");
        });
      });
    });

    describe("given different dates", () => {
      const baseUid = "recurring";

      describe("when creating UIDs for multiple occurrences", () => {
        it("then each occurrence has unique UID", () => {
          const uid1 = createOccurrenceUid(baseUid, new Date(2024, 0, 1));
          const uid2 = createOccurrenceUid(baseUid, new Date(2024, 0, 8));
          const uid3 = createOccurrenceUid(baseUid, new Date(2024, 0, 15));

          expect(uid1).toBe("recurring_2024-01-01");
          expect(uid2).toBe("recurring_2024-01-08");
          expect(uid3).toBe("recurring_2024-01-15");
          expect(new Set([uid1, uid2, uid3]).size).toBe(3);
        });
      });
    });
  });
});

// ---------------------------------------------------------------------------
// processCalendarEvents
// All dates use floating iCal times (no TZID / no Z) so they are interpreted
// as local time. Tests run with TZ=UTC (set via the npm test script) so local
// == UTC, making all date arithmetic unambiguous.
// ---------------------------------------------------------------------------

const CAL_URL = "https://test.example.com/calendar.ics";

// A future one-off event (tomorrow at 10am)
const ICS_FUTURE_EVENT = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:future@test
DTSTART:20260324T100000
DTEND:20260324T110000
SUMMARY:Future Meeting
END:VEVENT
END:VCALENDAR`;

// A past one-off event (yesterday at 10am)
const ICS_PAST_EVENT = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:past@test
DTSTART:20260322T100000
DTEND:20260322T110000
SUMMARY:Past Meeting
END:VEVENT
END:VCALENDAR`;

// Today's event, 11am–noon (used for both in-progress and already-ended tests)
const ICS_TODAY_EVENT = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:today@test
DTSTART:20260323T110000
DTEND:20260323T120000
SUMMARY:Today Meeting
END:VEVENT
END:VCALENDAR`;

// Daily recurring event, 2pm–3pm, starting today (5 occurrences)
const ICS_RECURRING_DAILY = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:recurring@test
DTSTART:20260323T140000
DTEND:20260323T150000
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Daily Meeting
END:VEVENT
END:VCALENDAR`;

// Daily recurring event, 2am–2:30am, with today's occurrence rescheduled to 11am
const ICS_RECURRING_WITH_OVERRIDE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:override@test
DTSTART:20260323T020000
DTEND:20260323T023000
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Early Meeting
END:VEVENT
BEGIN:VEVENT
UID:override@test
RECURRENCE-ID:20260323T020000
DTSTART:20260323T110000
DTEND:20260323T113000
SUMMARY:Early Meeting
END:VEVENT
END:VCALENDAR`;

// Daily recurring event starting yesterday (2am–2:30am), with yesterday's
// occurrence rescheduled to today 11am. Tests the recurrences sweep path where
// the original occurrence is before rangeStart so rrule.between() never returns it.
const ICS_RECURRING_SWEEP_OVERRIDE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:sweep@test
DTSTART:20260322T020000
DTEND:20260322T023000
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Swept Meeting
END:VEVENT
BEGIN:VEVENT
UID:sweep@test
RECURRENCE-ID:20260322T020000
DTSTART:20260323T110000
DTEND:20260323T113000
SUMMARY:Swept Meeting
END:VEVENT
END:VCALENDAR`;

describe("processCalendarEvents", () => {
  describe("non-recurring events", () => {
    describe("given a future event", () => {
      const now = new Date(2026, 2, 23, 12, 0, 0); // noon today

      describe("when processing", () => {
        it("then includes the event", () => {
          const { events } = processCalendarEvents(parseICS(ICS_FUTURE_EVENT), CAL_URL, now);
          expect(events).toHaveLength(1);
          expect(events[0].uid).toBe("future@test");
        });

        it("then maps the event uid to the calendar url", () => {
          const { events, eventCalendars } = processCalendarEvents(parseICS(ICS_FUTURE_EVENT), CAL_URL, now);
          expect(eventCalendars.get(events[0].uid)).toBe(CAL_URL);
        });
      });
    });

    describe("given a past event", () => {
      describe("when processing", () => {
        it("then excludes the event", () => {
          const now = new Date(2026, 2, 23, 12, 0, 0);
          const { events } = processCalendarEvents(parseICS(ICS_PAST_EVENT), CAL_URL, now);
          expect(events).toHaveLength(0);
        });
      });
    });

    describe("given an in-progress event", () => {
      describe("when processing", () => {
        it("then includes the event", () => {
          const now = new Date(2026, 2, 23, 11, 30, 0); // 11:30am, event runs 11am–noon
          const { events } = processCalendarEvents(parseICS(ICS_TODAY_EVENT), CAL_URL, now);
          expect(events).toHaveLength(1);
        });
      });
    });

    describe("given an already-ended event today", () => {
      describe("when processing", () => {
        it("then excludes the event", () => {
          const now = new Date(2026, 2, 23, 12, 30, 0); // 12:30pm, event ended at noon
          const { events } = processCalendarEvents(parseICS(ICS_TODAY_EVENT), CAL_URL, now);
          expect(events).toHaveLength(0);
        });
      });
    });
  });

  describe("recurring events", () => {
    describe("given an in-progress recurring occurrence", () => {
      // Regression: rangeStart was `now`, so occurrences that started before
      // now were excluded even if they hadn't ended yet.
      describe("when processing", () => {
        it("then includes the in-progress occurrence", () => {
          const now = new Date(2026, 2, 23, 14, 30, 0); // 2:30pm, occurrence runs 2pm–3pm
          const { events } = processCalendarEvents(parseICS(ICS_RECURRING_DAILY), CAL_URL, now);
          const todayOccurrence = events.find(
            (e) =>
              new Date(e.start as Date).getDate() === 23 &&
              new Date(e.start as Date).getHours() === 14,
          );
          expect(todayOccurrence).toBeDefined();
        });
      });
    });

    describe("given an already-ended recurring occurrence today", () => {
      describe("when processing", () => {
        it("then excludes that occurrence", () => {
          const now = new Date(2026, 2, 23, 15, 30, 0); // 3:30pm, occurrence ended at 3pm
          const { events } = processCalendarEvents(parseICS(ICS_RECURRING_DAILY), CAL_URL, now);
          const todayOccurrence = events.find(
            (e) =>
              new Date(e.start as Date).getDate() === 23 &&
              new Date(e.start as Date).getHours() === 14,
          );
          expect(todayOccurrence).toBeUndefined();
        });

        it("then still includes future occurrences", () => {
          const now = new Date(2026, 2, 23, 15, 30, 0);
          const { events } = processCalendarEvents(parseICS(ICS_RECURRING_DAILY), CAL_URL, now);
          expect(events.length).toBeGreaterThan(0);
          for (const event of events) {
            expect(new Date(event.end as Date).getTime()).toBeGreaterThan(now.getTime());
          }
        });
      });
    });

    describe("given a recurring event with a rescheduled occurrence (RECURRENCE-ID)", () => {
      // Original: 2am–2:30am. Override: 11am–11:30am same day.
      describe("when processing at 8am (after original, before rescheduled)", () => {
        const now = new Date(2026, 2, 23, 8, 0, 0);

        it("then includes the occurrence at the rescheduled time", () => {
          const { events } = processCalendarEvents(parseICS(ICS_RECURRING_WITH_OVERRIDE), CAL_URL, now);
          const todayEvents = events.filter(
            (e) => new Date(e.start as Date).getDate() === 23,
          );
          expect(todayEvents).toHaveLength(1);
          expect(new Date(todayEvents[0].start as Date).getHours()).toBe(11);
        });

        it("then does not include the original time", () => {
          const { events } = processCalendarEvents(parseICS(ICS_RECURRING_WITH_OVERRIDE), CAL_URL, now);
          const atOriginalTime = events.find(
            (e) =>
              new Date(e.start as Date).getDate() === 23 &&
              new Date(e.start as Date).getHours() === 2,
          );
          expect(atOriginalTime).toBeUndefined();
        });
      });
    });

    describe("given a rescheduled occurrence whose original date is outside the rrule expansion range", () => {
      // Original: yesterday 2am (before rangeStart = midnight today).
      // Override: today 11am. The recurrences sweep must catch it.
      describe("when processing at 9am today", () => {
        const now = new Date(2026, 2, 23, 9, 0, 0);

        it("then includes the rescheduled occurrence", () => {
          const { events } = processCalendarEvents(parseICS(ICS_RECURRING_SWEEP_OVERRIDE), CAL_URL, now);
          const todayEvents = events.filter(
            (e) => new Date(e.start as Date).getDate() === 23,
          );
          expect(todayEvents).toHaveLength(1);
          expect(new Date(todayEvents[0].start as Date).getHours()).toBe(11);
        });
      });
    });
  });
});
