import { describe, it, expect } from "vitest";
import {
  sortEvents,
  groupEventsByDate,
  convertRruleDate,
  calendarsChanged,
  isFutureEvent,
  createOccurrenceUid,
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
    describe("given an event starting after reference date", () => {
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

    describe("given an event starting before reference date", () => {
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

    describe("given an event starting exactly at reference date", () => {
      const referenceDate = new Date(2024, 6, 15, 10, 0);
      const event = {
        uid: "1",
        summary: "Now",
        start: new Date(2024, 6, 15, 10, 0),
        end: new Date(2024, 6, 15, 11, 0),
      };

      describe("when checking", () => {
        it("then returns true (inclusive)", () => {
          expect(isFutureEvent(event, referenceDate)).toBe(true);
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
