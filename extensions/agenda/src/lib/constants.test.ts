import { describe, it, expect } from "vitest";
import { CACHE_KEY, CACHE_VERSION } from "./constants";

describe("constants", () => {
  describe("CACHE_KEY", () => {
    it("then is a non-empty string", () => {
      expect(typeof CACHE_KEY).toBe("string");
      expect(CACHE_KEY.length).toBeGreaterThan(0);
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
