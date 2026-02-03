import { describe, it, expect } from "vitest";
import { validateCache, buildCacheData, CacheData } from "./cacheValidation";
import { CACHE_DURATION, CACHE_VERSION } from "./constants";

describe("cacheValidation", () => {
  describe("validateCache", () => {
    const validCalendars = [
      { url: "https://example.com/cal1.ics", name: "Work", color: "blue" },
      { url: "https://example.com/cal2.ics", name: "Personal", color: "blue" },
    ];

    const validCacheData: CacheData = {
      eventsByDate: { "2024-01-15": [] },
      eventCalendars: { "event-1": "https://example.com/cal1.ics" },
      calendarUrls: [
        "https://example.com/cal1.ics",
        "https://example.com/cal2.ics",
      ],
      calendarNames: ["Personal", "Work"],
      timestamp: Date.now(),
      cacheVersion: CACHE_VERSION,
    };

    describe("given valid cache data", () => {
      describe("when validating", () => {
        it("then returns valid", () => {
          const result = validateCache(validCacheData, validCalendars as any);
          expect(result.valid).toBe(true);
          expect(result.reason).toBeUndefined();
        });
      });
    });

    describe.each([
      {
        scenario: "missing eventCalendars",
        cacheData: { eventCalendars: undefined },
        expectedReason: "missing eventCalendars",
      },
      {
        scenario: "missing timestamp",
        cacheData: { timestamp: undefined },
        expectedReason: "missing timestamp",
      },
      {
        scenario: "wrong version",
        cacheData: { cacheVersion: CACHE_VERSION + 1 },
        expectedReason: "version mismatch",
      },
      {
        scenario: "expired",
        cacheData: { timestamp: Date.now() - CACHE_DURATION - 1000 },
        expectedReason: "expired",
      },
    ])("given cache with $scenario", ({ cacheData, expectedReason }) => {
      it(`then returns invalid with reason "${expectedReason}"`, () => {
        const result = validateCache(
          { ...validCacheData, ...cacheData } as any,
          validCalendars as any,
        );
        expect(result.valid).toBe(false);
        expect(result.reason).toBe(expectedReason);
      });
    });

    describe("given cache at exact expiration boundary", () => {
      const now = Date.now();
      const boundaryTimestamp = now - CACHE_DURATION;
      const cacheData = { ...validCacheData, timestamp: boundaryTimestamp };

      describe("when validating", () => {
        it("then returns invalid (exclusive boundary)", () => {
          const result = validateCache(cacheData, validCalendars as any, now);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe("expired");
        });
      });
    });

    describe("given cache just before expiration", () => {
      const now = Date.now();
      const justBeforeExpiry = now - CACHE_DURATION + 1;
      const cacheData = { ...validCacheData, timestamp: justBeforeExpiry };

      describe("when validating", () => {
        it("then returns valid", () => {
          const result = validateCache(cacheData, validCalendars as any, now);
          expect(result.valid).toBe(true);
        });
      });
    });

    describe("given calendar URLs changed", () => {
      const differentCalendars = [
        {
          url: "https://example.com/different.ics",
          name: "Work",
          color: "blue",
        },
      ];

      describe("when validating", () => {
        it("then returns invalid with reason", () => {
          const result = validateCache(
            validCacheData,
            differentCalendars as any,
          );
          expect(result.valid).toBe(false);
          expect(result.reason).toBe("calendar URLs changed");
        });
      });
    });

    describe("given calendar names changed", () => {
      const renamedCalendars = [
        {
          url: "https://example.com/cal1.ics",
          name: "Renamed Work",
          color: "blue",
        },
        {
          url: "https://example.com/cal2.ics",
          name: "Personal",
          color: "blue",
        },
      ];

      describe("when validating", () => {
        it("then returns invalid with reason", () => {
          const result = validateCache(validCacheData, renamedCalendars as any);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe("calendar names changed");
        });
      });
    });

    describe("given calendars in different order", () => {
      const reorderedCalendars = [
        {
          url: "https://example.com/cal2.ics",
          name: "Personal",
          color: "blue",
        },
        { url: "https://example.com/cal1.ics", name: "Work", color: "blue" },
      ];

      describe("when validating", () => {
        it("then returns valid (order independent)", () => {
          const result = validateCache(
            validCacheData,
            reorderedCalendars as any,
          );
          expect(result.valid).toBe(true);
        });
      });
    });

    describe("given empty calendars list", () => {
      const emptyCacheData: CacheData = {
        ...validCacheData,
        calendarUrls: [],
        calendarNames: [],
      };

      describe("when validating with empty calendars", () => {
        it("then returns valid", () => {
          const result = validateCache(emptyCacheData, []);
          expect(result.valid).toBe(true);
        });
      });
    });

    describe("given cache with missing calendarUrls field", () => {
      const cacheData = { ...validCacheData, calendarUrls: undefined };

      describe("when validating against non-empty calendars", () => {
        it("then returns invalid", () => {
          const result = validateCache(cacheData as any, validCalendars as any);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe("calendar URLs changed");
        });
      });
    });
  });

  describe("buildCacheData", () => {
    const calendars = [
      { url: "https://example.com/cal1.ics", name: "Work", color: "blue" },
      { url: "https://example.com/cal2.ics", name: "Personal", color: "blue" },
    ];

    describe("given events and calendars", () => {
      const eventsByDate = {
        "2024-01-15": [{ uid: "event-1" }],
        "2024-01-16": [{ uid: "event-2" }, { uid: "event-3" }],
      };
      const eventCalendars = new Map([
        ["event-1", "https://example.com/cal1.ics"],
        ["event-2", "https://example.com/cal2.ics"],
      ]);

      describe("when building cache data", () => {
        it("then includes eventsByDate", () => {
          const result = buildCacheData(
            eventsByDate as any,
            calendars as any,
            eventCalendars,
          );
          expect(result.eventsByDate).toEqual(eventsByDate);
        });

        it("then converts eventCalendars Map to object", () => {
          const result = buildCacheData(
            eventsByDate as any,
            calendars as any,
            eventCalendars,
          );
          expect(result.eventCalendars).toEqual({
            "event-1": "https://example.com/cal1.ics",
            "event-2": "https://example.com/cal2.ics",
          });
        });

        it("then sorts calendar URLs", () => {
          const result = buildCacheData(
            eventsByDate as any,
            calendars as any,
            eventCalendars,
          );
          expect(result.calendarUrls).toEqual([
            "https://example.com/cal1.ics",
            "https://example.com/cal2.ics",
          ]);
        });

        it("then sorts calendar names", () => {
          const result = buildCacheData(
            eventsByDate as any,
            calendars as any,
            eventCalendars,
          );
          expect(result.calendarNames).toEqual(["Personal", "Work"]);
        });

        it("then includes current cache version", () => {
          const result = buildCacheData(
            eventsByDate as any,
            calendars as any,
            eventCalendars,
          );
          expect(result.cacheVersion).toBe(CACHE_VERSION);
        });

        it("then includes timestamp", () => {
          const timestamp = 1234567890;
          const result = buildCacheData(
            eventsByDate as any,
            calendars as any,
            eventCalendars,
            timestamp,
          );
          expect(result.timestamp).toBe(timestamp);
        });
      });
    });

    describe("given empty inputs", () => {
      describe("when building cache data", () => {
        it("then handles empty eventsByDate", () => {
          const result = buildCacheData({}, calendars as any, new Map());
          expect(result.eventsByDate).toEqual({});
        });

        it("then handles empty eventCalendars", () => {
          const result = buildCacheData({}, calendars as any, new Map());
          expect(result.eventCalendars).toEqual({});
        });

        it("then handles empty calendars", () => {
          const result = buildCacheData({}, [], new Map());
          expect(result.calendarUrls).toEqual([]);
          expect(result.calendarNames).toEqual([]);
        });
      });
    });
  });
});
