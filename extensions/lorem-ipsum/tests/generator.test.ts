import { describe, expect, it } from "vitest";
import {
  generate,
  generateUntilCharacters,
  textStats,
} from "../src/lib/generator";

describe("generate", () => {
  it("starts words with the classic opening", () => {
    expect(generate({ kind: "words", count: 5, startWithLorem: true })).toBe(
      "lorem ipsum dolor sit amet",
    );
  });

  it("starts sentences with the classic first sentence", () => {
    expect(generate({ kind: "sentences", count: 1, startWithLorem: true })).toBe(
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    );
  });

  it("wraps HTML in the requested tag", () => {
    const html = generate({ kind: "html", count: 1, startWithLorem: true, htmlTag: "div" });
    expect(html.startsWith("<div>")).toBe(true);
    expect(html.endsWith("</div>")).toBe(true);
    expect(html).toContain("Lorem ipsum dolor sit amet");
  });

  it("formats lists with the requested style", () => {
    expect(generate({ kind: "list", count: 1, startWithLorem: true, listStyle: "dash" })).toBe(
      "- Lorem ipsum dolor sit amet",
    );
    expect(generate({ kind: "list", count: 1, startWithLorem: true, listStyle: "numbered" })).toBe(
      "1. Lorem ipsum dolor sit amet",
    );

    const html = generate({ kind: "list", count: 1, startWithLorem: true, listStyle: "html" });
    expect(html).toBe("<ul>\n  <li>Lorem ipsum dolor sit amet</li>\n</ul>");
  });

  it("returns an empty string for a non-positive count", () => {
    expect(generate({ kind: "words", count: 0, startWithLorem: false })).toBe("");
  });

  it("title-cases a title of N words", () => {
    const title = generate({ kind: "titles", count: 3, startWithLorem: true });
    expect(title).toBe("Lorem Ipsum Dolor");
  });
});

describe("generateUntilCharacters", () => {
  it("returns exactly the requested length without trailing spaces", () => {
    for (const n of [1, 12, 80]) {
      const text = generateUntilCharacters(n, n === 12);
      expect(textStats(text).characters).toBe(n);
      expect(text).not.toMatch(/\s$/);
    }
  });

  it("uses the classic opening when requested", () => {
    expect(generateUntilCharacters(12, true)).toBe("lorem ipsum.");
  });
});

describe("textStats", () => {
  it("counts characters, words, and lines", () => {
    expect(textStats("lorem ipsum\ndolor")).toEqual({
      characters: 17,
      words: 3,
      lines: 2,
    });
  });

  it("returns zeros for empty text", () => {
    expect(textStats("")).toEqual({ characters: 0, words: 0, lines: 0 });
  });
});
