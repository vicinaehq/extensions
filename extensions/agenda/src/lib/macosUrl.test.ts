import { describe, it, expect } from "vitest";
import {
  isMacOSCalendarUrl,
  macosCalendarIdentifier,
  macosCalendarUrl,
} from "./macosUrl";

describe("macosUrl", () => {
  describe("isMacOSCalendarUrl", () => {
    it("returns true for the reserved scheme", () => {
      expect(isMacOSCalendarUrl("macos://ABC-123")).toBe(true);
    });

    it("returns false for iCal and local paths", () => {
      expect(isMacOSCalendarUrl("https://example.com/cal.ics")).toBe(false);
      expect(isMacOSCalendarUrl("~/calendars/work")).toBe(false);
    });
  });

  describe("macosCalendarUrl", () => {
    it("builds a URL from an identifier", () => {
      expect(macosCalendarUrl("ABC-123")).toBe("macos://ABC-123");
    });
  });

  describe("macosCalendarIdentifier", () => {
    it("extracts the identifier back out", () => {
      expect(macosCalendarIdentifier("macos://ABC-123")).toBe("ABC-123");
    });

    it("round-trips through macosCalendarUrl", () => {
      expect(macosCalendarIdentifier(macosCalendarUrl("id-1"))).toBe("id-1");
    });
  });
});
