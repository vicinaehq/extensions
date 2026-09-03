import { describe, expect, it } from "vitest";
import { MAX_COUNT } from "../src/lib/generator";
import { parseCount, parseQuery, resolveCount, stripKindSuffix } from "../src/lib/parse";

describe("parseCount", () => {
  it("uses the fallback when the value is empty", () => {
    expect(parseCount(undefined, 3)).toEqual({ ok: true, value: 3 });
    expect(parseCount("", 5)).toEqual({ ok: true, value: 5 });
    expect(parseCount("  ", 1)).toEqual({ ok: true, value: 1 });
  });

  it("accepts whole numbers in range", () => {
    expect(parseCount("1")).toEqual({ ok: true, value: 1 });
    expect(parseCount("2000")).toEqual({ ok: true, value: MAX_COUNT });
  });

  it("rejects non-numeric and out-of-range values", () => {
    expect(parseCount("abc").ok).toBe(false);
    expect(parseCount("0").ok).toBe(false);
    expect(parseCount("1.5").ok).toBe(false);
    expect(parseCount("2001").ok).toBe(false);
  });
});

describe("parseQuery", () => {
  it("parses a bare count", () => {
    expect(parseQuery("3")).toEqual({ count: 3 });
  });

  it("parses kind suffixes", () => {
    expect(parseQuery("5p")).toEqual({ count: 5, kind: "paragraphs" });
    expect(parseQuery("5 paragraphs")).toEqual({ count: 5, kind: "paragraphs" });
    expect(parseQuery("20w")).toEqual({ count: 20, kind: "words" });
    expect(parseQuery("8l")).toEqual({ count: 8, kind: "list" });
    expect(parseQuery("2h")).toEqual({ count: 2, kind: "html" });
    expect(parseQuery("4t")).toEqual({ count: 4, kind: "titles" });
    expect(parseQuery("6s")).toEqual({ count: 6, kind: "sentences" });
  });

  it("parses a character budget", () => {
    expect(parseQuery("120c")).toEqual({ count: 120, characters: true });
    expect(parseQuery("120 chars")).toEqual({ count: 120, characters: true });
    expect(parseQuery("80 characters")).toEqual({ count: 80, characters: true });
  });

  it("returns empty for invalid queries", () => {
    expect(parseQuery("")).toEqual({});
    expect(parseQuery("foo")).toEqual({});
    expect(parseQuery("2001")).toEqual({});
    expect(parseQuery("-3")).toEqual({});
  });
});

describe("stripKindSuffix", () => {
  it("keeps the number when a suffix is present", () => {
    expect(stripKindSuffix("5w")).toBe("5");
    expect(stripKindSuffix("120c")).toBe("120");
    expect(stripKindSuffix("3 paragraphs")).toBe("3");
  });

  it("leaves unmatched text alone", () => {
    expect(stripKindSuffix("")).toBe("");
    expect(stripKindSuffix("foo")).toBe("foo");
  });
});

describe("resolveCount", () => {
  it("uses the built-in default when the preference is empty", () => {
    expect(resolveCount(undefined, undefined, 5)).toEqual({ ok: true, value: 5 });
    expect(resolveCount(undefined, "  ", 1)).toEqual({ ok: true, value: 1 });
  });

  it("uses a valid preference when the argument is omitted", () => {
    expect(resolveCount(undefined, "8", 1)).toEqual({ ok: true, value: 8 });
  });

  it("prefers the argument over the preference", () => {
    expect(resolveCount("3", "8", 1)).toEqual({ ok: true, value: 3 });
  });

  it("uses a valid argument even when the preference is invalid", () => {
    expect(resolveCount("3", "abc", 5)).toEqual({ ok: true, value: 3 });
    expect(resolveCount("3", "0", 5)).toEqual({ ok: true, value: 3 });
  });

  it("rejects an invalid preference instead of falling back", () => {
    expect(resolveCount(undefined, "abc", 5).ok).toBe(false);
    expect(resolveCount(undefined, "0", 5).ok).toBe(false);
    expect(resolveCount(undefined, "2001", 5).ok).toBe(false);
  });
});
