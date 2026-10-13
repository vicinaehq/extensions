import { describe, expect, test } from "bun:test";
import { formatTokens } from "../src/lib/format";

describe("token formatting", () => {
  test("small counts stay raw", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  test("thousands read as k", () => {
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(9800)).toBe("9.8k");
    expect(formatTokens(20480)).toBe("20k");
    expect(formatTokens(999_999)).toBe("1000k");
  });

  test("millions read as M", () => {
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(2_000_000)).toBe("2M");
  });
});
