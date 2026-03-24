import { describe, it, expect } from "vitest";
import { CACHE_KEY, CACHE_DURATION, CACHE_VERSION } from "./constants";

describe("constants", () => {
  describe("CACHE_KEY", () => {
    it("then is a non-empty string", () => {
      expect(typeof CACHE_KEY).toBe("string");
      expect(CACHE_KEY.length).toBeGreaterThan(0);
    });
  });

  describe("CACHE_DURATION", () => {
    it("then is a positive number in milliseconds", () => {
      expect(typeof CACHE_DURATION).toBe("number");
      expect(CACHE_DURATION).toBeGreaterThan(0);
    });

    it("then is at least 1 minute", () => {
      expect(CACHE_DURATION).toBeGreaterThanOrEqual(60 * 1000);
    });

    it("then is at most 1 hour", () => {
      expect(CACHE_DURATION).toBeLessThanOrEqual(60 * 60 * 1000);
    });
  });

  describe("CACHE_VERSION", () => {
    it("then is a positive integer", () => {
      expect(typeof CACHE_VERSION).toBe("number");
      expect(Number.isInteger(CACHE_VERSION)).toBe(true);
      expect(CACHE_VERSION).toBeGreaterThan(0);
    });
  });
});
