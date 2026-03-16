import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCalendarName, formatDate } from "./calendar";

describe("calendar", () => {
  describe("getCalendarName", () => {
    describe("given a calendar with explicit name", () => {
      const calendar = {
        url: "https://example.com/calendar.ics",
        name: "Work Calendar",
        color: "blue",
      };

      describe("when getting calendar name", () => {
        it("then returns the explicit name", () => {
          expect(getCalendarName(calendar as any)).toBe("Work Calendar");
        });
      });
    });

    describe("given a calendar without name", () => {
      describe("when URL has meaningful path segment", () => {
        const calendar = {
          url: "https://calendar.google.com/calendar/ical/user%40gmail.com/basic.ics",
          name: "",
          color: "blue",
        };

        it("then extracts name from last path segment", () => {
          expect(getCalendarName(calendar as any)).toBe("basic.ics");
        });
      });

      describe("when URL path ends with 'ical'", () => {
        const calendar = {
          url: "https://example.com/calendars/personal/ical",
          name: "",
          color: "blue",
        };

        it("then returns hostname instead", () => {
          expect(getCalendarName(calendar as any)).toBe("example.com");
        });
      });

      describe("when URL has encoded characters", () => {
        const calendar = {
          url: "https://example.com/My%20Calendar.ics",
          name: "",
          color: "blue",
        };

        it("then decodes the URL component", () => {
          expect(getCalendarName(calendar as any)).toBe("My Calendar.ics");
        });
      });

      describe("when URL has no path", () => {
        const calendar = {
          url: "https://calendar.example.com/",
          name: "",
          color: "blue",
        };

        it("then returns hostname", () => {
          expect(getCalendarName(calendar as any)).toBe("calendar.example.com");
        });
      });

      describe("when URL is invalid", () => {
        const calendar = {
          url: "not-a-valid-url",
          name: "",
          color: "blue",
        };

        it("then returns the raw URL as fallback", () => {
          expect(getCalendarName(calendar as any)).toBe("not-a-valid-url");
        });
      });
    });

    describe("given a calendar with empty string name", () => {
      const calendar = {
        url: "https://example.com/team-calendar.ics",
        name: "",
        color: "blue",
      };

      describe("when getting calendar name", () => {
        it("then extracts from URL", () => {
          expect(getCalendarName(calendar as any)).toBe("team-calendar.ics");
        });
      });
    });
  });

  describe("formatDate", () => {
    let realDate: typeof Date;

    beforeEach(() => {
      realDate = global.Date;
    });

    afterEach(() => {
      global.Date = realDate;
    });

    describe("given today's date", () => {
      it("then returns 'Today'", () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        const dateString = `${year}-${month}-${day}`;

        expect(formatDate(dateString)).toBe("Today");
      });
    });

    describe("given tomorrow's date", () => {
      it("then returns 'Tomorrow'", () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
        const day = String(tomorrow.getDate()).padStart(2, "0");
        const dateString = `${year}-${month}-${day}`;

        expect(formatDate(dateString)).toBe("Tomorrow");
      });
    });

    describe("given a date in the future", () => {
      it("then returns formatted date with weekday", () => {
        // Use a fixed future date far enough to not be today/tomorrow
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 10);
        const year = futureDate.getFullYear();
        const month = String(futureDate.getMonth() + 1).padStart(2, "0");
        const day = String(futureDate.getDate()).padStart(2, "0");
        const dateString = `${year}-${month}-${day}`;

        const result = formatDate(dateString);

        // Should contain weekday name
        expect(result).toMatch(
          /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/,
        );
        // Should contain month name
        expect(result).toMatch(
          /January|February|March|April|May|June|July|August|September|October|November|December/,
        );
      });
    });

    describe("given a specific known date", () => {
      it("then formats correctly", () => {
        // December 25, 2024 is a Wednesday
        // Only test if it's not today or tomorrow
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const testDate = new Date(2024, 11, 25);

        if (testDate.getTime() !== today.getTime()) {
          const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
          if (testDate.getTime() !== tomorrow.getTime()) {
            const result = formatDate("2024-12-25");
            expect(result).toBe("Wednesday, December 25");
          }
        }
      });
    });

    describe("given date string edge cases", () => {
      describe("when month is January (01)", () => {
        it("then parses correctly", () => {
          const result = formatDate("2025-01-15");
          expect(result).toMatch(/January/);
        });
      });

      describe("when day is single digit", () => {
        it("then parses correctly", () => {
          const result = formatDate("2025-03-05");
          expect(result).toMatch(/5/);
        });
      });
    });
  });
});
