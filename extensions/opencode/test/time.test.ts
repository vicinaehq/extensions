import { describe, expect, test } from "bun:test";
import { relativeTime, timeBucket } from "../src/lib/time";

const DAY = 86_400_000;

describe("relative time", () => {
  test("recent timestamps read naturally", () => {
    const now = Date.now();
    expect(relativeTime(now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000)).toBe("5m ago");
    expect(relativeTime(now - 3 * 3_600_000)).toBe("3h ago");
    expect(relativeTime(now - 2 * DAY)).toBe("2d ago");
    expect(relativeTime(undefined)).toBeUndefined();
    expect(relativeTime(now + 60_000)).toBe("just now"); // future timestamps clamp
  });
});

describe("time buckets", () => {
  // A fixed reference so bucket edges are stable regardless of run time.
  const NOW = Date.UTC(2026, 8, 22, 12, 0, 0);

  test("timestamps fall into the right section", () => {
    expect(timeBucket(NOW, NOW)).toBe("Today");
    expect(timeBucket(NOW - DAY, NOW)).toBe("Yesterday");
    expect(timeBucket(NOW - 3 * DAY, NOW)).toBe("This Week");
    expect(timeBucket(NOW - 10 * DAY, NOW)).toBe("This Month");
    expect(timeBucket(NOW - 60 * DAY, NOW)).toBe("Older");
  });

  test("late yesterday is not today", () => {
    expect(timeBucket(NOW - DAY - 3_600_000, NOW)).toBe("Yesterday");
  });
});
