import { describe, it, expect } from "vitest";
import { secondsRemaining } from "../../src/utils/totp";

describe("totp.secondsRemaining", () => {
  it("returns 30 at the start of a 30s window", () => {
    expect(secondsRemaining(0, 30)).toBe(30);
    expect(secondsRemaining(30_000, 30)).toBe(30);
  });

  it("returns 1 just before a window ends", () => {
    expect(secondsRemaining(29_000, 30)).toBe(1);
  });

  it("respects custom periods", () => {
    expect(secondsRemaining(45_000, 60)).toBe(15);
  });
});
