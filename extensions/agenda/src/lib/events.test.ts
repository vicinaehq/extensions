import { describe, it, expect } from "vitest";
import {
  isAllDayEvent,
  getDisplayStart,
  getDisplayEnd,
  getLocalDateString,
} from "./events";

describe("events", () => {
  describe("isAllDayEvent", () => {
    describe("given an event spanning exactly 24 hours at midnight", () => {
      const start = new Date(2024, 0, 15, 0, 0, 0);
      const end = new Date(2024, 0, 16, 0, 0, 0);

      describe("when checking if all-day", () => {
        it("then returns true", () => {
          expect(isAllDayEvent(start, end)).toBe(true);
        });
      });
    });

    describe("given an event with non-midnight start time", () => {
      const start = new Date(2024, 0, 15, 9, 0, 0);
      const end = new Date(2024, 0, 16, 9, 0, 0);

      describe("when checking if all-day", () => {
        it("then returns false", () => {
          expect(isAllDayEvent(start, end)).toBe(false);
        });
      });
    });

    describe("given an event with non-midnight end time", () => {
      const start = new Date(2024, 0, 15, 0, 0, 0);
      const end = new Date(2024, 0, 15, 17, 0, 0);

      describe("when checking if all-day", () => {
        it("then returns false", () => {
          expect(isAllDayEvent(start, end)).toBe(false);
        });
      });
    });

    describe("given an event spanning multiple days at midnight", () => {
      const start = new Date(2024, 0, 15, 0, 0, 0);
      const end = new Date(2024, 0, 17, 0, 0, 0); // 48 hours

      describe("when checking if all-day", () => {
        it("then returns false (must be exactly 24 hours)", () => {
          expect(isAllDayEvent(start, end)).toBe(false);
        });
      });
    });

    describe("given an event with seconds set", () => {
      const start = new Date(2024, 0, 15, 0, 0, 30);
      const end = new Date(2024, 0, 16, 0, 0, 30);

      describe("when checking if all-day", () => {
        it("then returns false", () => {
          expect(isAllDayEvent(start, end)).toBe(false);
        });
      });
    });

    describe("given an event with minutes set", () => {
      const start = new Date(2024, 0, 15, 0, 30, 0);
      const end = new Date(2024, 0, 16, 0, 30, 0);

      describe("when checking if all-day", () => {
        it("then returns false", () => {
          expect(isAllDayEvent(start, end)).toBe(false);
        });
      });
    });
  });

  describe("getDisplayStart", () => {
    describe("given an all-day event", () => {
      const start = new Date(2024, 0, 15, 10, 30, 0);

      describe("when getting display start", () => {
        it("then returns empty string", () => {
          expect(getDisplayStart(start, true)).toBe("");
        });
      });
    });

    describe("given a timed event with 12-hour format", () => {
      const start = new Date(2024, 0, 15, 14, 30, 0);

      describe("when getting display start", () => {
        it("then returns formatted time with AM/PM indicator", () => {
          const result = getDisplayStart(start, false, false);
          expect(result).toMatch(/2:30|02:30/);
          // Locale-dependent: "PM", "p. m.", "p.m.", etc.
          expect(result.toLowerCase()).toMatch(/p\.?\s?m\.?/);
        });
      });
    });

    describe("given a timed event with 24-hour format", () => {
      const start = new Date(2024, 0, 15, 14, 30, 0);

      describe("when getting display start", () => {
        it("then returns formatted time without AM/PM", () => {
          const result = getDisplayStart(start, false, true);
          expect(result).toMatch(/14:30/);
          expect(result).not.toMatch(/AM|PM/i);
        });
      });
    });

    describe("given morning time with 12-hour format", () => {
      const start = new Date(2024, 0, 15, 9, 15, 0);

      describe("when getting display start", () => {
        it("then returns AM time", () => {
          const result = getDisplayStart(start, false, false);
          expect(result).toMatch(/9:15|09:15/);
          // Locale-dependent: "AM", "a. m.", "a.m.", etc.
          expect(result.toLowerCase()).toMatch(/a\.?\s?m\.?/);
        });
      });
    });
  });

  describe("getDisplayEnd", () => {
    describe("given an all-day event", () => {
      const end = new Date(2024, 0, 16, 0, 0, 0);

      describe("when getting display end", () => {
        it("then returns undefined", () => {
          expect(getDisplayEnd(end, true)).toBeUndefined();
        });
      });
    });

    describe("given a timed event with 12-hour format", () => {
      const end = new Date(2024, 0, 15, 17, 45, 0);

      describe("when getting display end", () => {
        it("then returns formatted time with AM/PM indicator", () => {
          const result = getDisplayEnd(end, false, false);
          expect(result).toMatch(/5:45|05:45/);
          // Locale-dependent: "PM", "p. m.", "p.m.", etc.
          expect(result?.toLowerCase()).toMatch(/p\.?\s?m\.?/);
        });
      });
    });

    describe("given a timed event with 24-hour format", () => {
      const end = new Date(2024, 0, 15, 17, 45, 0);

      describe("when getting display end", () => {
        it("then returns formatted time without AM/PM", () => {
          const result = getDisplayEnd(end, false, true);
          expect(result).toMatch(/17:45/);
          expect(result).not.toMatch(/AM|PM/i);
        });
      });
    });
  });

  describe("getLocalDateString", () => {
    describe("given a date in the middle of the year", () => {
      const date = new Date(2024, 5, 15, 14, 30, 0); // June 15, 2024

      describe("when getting local date string", () => {
        it("then returns YYYY-MM-DD format", () => {
          expect(getLocalDateString(date)).toBe("2024-06-15");
        });
      });
    });

    describe("given a date at the start of the year", () => {
      const date = new Date(2024, 0, 1, 0, 0, 0); // January 1, 2024

      describe("when getting local date string", () => {
        it("then returns padded month and day", () => {
          expect(getLocalDateString(date)).toBe("2024-01-01");
        });
      });
    });

    describe("given a date at the end of the year", () => {
      const date = new Date(2024, 11, 31, 23, 59, 59); // December 31, 2024

      describe("when getting local date string", () => {
        it("then returns correct date string", () => {
          expect(getLocalDateString(date)).toBe("2024-12-31");
        });
      });
    });

    describe("given single-digit month and day", () => {
      const date = new Date(2024, 2, 5); // March 5, 2024

      describe("when getting local date string", () => {
        it("then pads with leading zeros", () => {
          expect(getLocalDateString(date)).toBe("2024-03-05");
        });
      });
    });

    describe("given a date with time component", () => {
      const date = new Date(2024, 7, 20, 23, 59, 59); // August 20, 2024 at 23:59:59

      describe("when getting local date string", () => {
        it("then ignores time and returns date only", () => {
          expect(getLocalDateString(date)).toBe("2024-08-20");
        });
      });
    });
  });
});
