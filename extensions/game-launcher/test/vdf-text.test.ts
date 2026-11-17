import { describe, expect, it } from "vitest";
import { getKey, getNumber, getObject, getString, parseVdf, VdfSyntaxError } from "../src/lib/vdf/text";

describe("parseVdf", () => {
  it("parses an appmanifest", () => {
    const doc = parseVdf(`"AppState"
{
	"appid"		"1145350"
	"name"		"Hades II"
	"StateFlags"		"4"
	"InstalledDepots"
	{
		"1145352"
		{
			"manifest"		"6846318752230433935"
		}
	}
}
`);
    const state = getObject(doc, "AppState");
    expect(getNumber(state, "appid")).toBe(1145350);
    expect(getString(state, "name")).toBe("Hades II");
    expect(getString(getObject(state, "InstalledDepots", "1145352"), "manifest")).toBe("6846318752230433935");
  });

  it("handles escapes, comments, unquoted tokens and conditionals", () => {
    const doc = parseVdf(`// header comment
root {
  "path" "C:\\\\Games\\\\Steam"
  "quote" "say \\"hi\\""
  unquoted value // trailing comment
  "cond" "x" [$WIN32]
}`);
    const root = getObject(doc, "root");
    expect(getString(root, "path")).toBe("C:\\Games\\Steam");
    expect(getString(root, "quote")).toBe('say "hi"');
    expect(getString(root, "unquoted")).toBe("value");
    expect(getString(root, "cond")).toBe("x");
  });

  it("merges duplicate objects and lets later scalars win", () => {
    const doc = parseVdf(`"a" { "x" "1" } "a" { "y" "2" } "s" "old" "s" "new"`);
    expect(getObject(doc, "a")).toEqual({ x: "1", y: "2" });
    expect(getString(doc, "s")).toBe("new");
  });

  it("looks keys up case-insensitively", () => {
    const doc = parseVdf(`"Software" { "valve" { "Steam" { "Apps" { "10" { "LastPlayed" "1" } } } } }`);
    expect(getObject(doc, "software", "Valve", "steam", "apps", "10")).toEqual({ LastPlayed: "1" });
    expect(getKey(undefined, "x")).toBeUndefined();
  });

  it("handles strings with and without escapes in the same document (fast and slow paths)", () => {
    const doc = parseVdf(`"a" "plain" "b" "C:\\\\x" "c" "plain again" "d" "tab\\there" "e" "\\"quoted\\""`);
    expect(doc).toEqual({ a: "plain", b: "C:\\x", c: "plain again", d: "tab\there", e: '"quoted"' });
  });

  it("treats all whitespace, including tabs and non-breaking spaces, as separators", () => {
    expect(parseVdf("k\u00a0v\fk2\vv2")).toEqual({ k: "v", k2: "v2" });
  });

  it("strips a UTF-8 BOM", () => {
    expect(parseVdf(`\uFEFF"k" "v"`)).toEqual({ k: "v" });
  });

  it.each([
    [`"a" {`, /unclosed object/],
    [`"a" "b" }`, /Unbalanced closing brace/],
    [`"a"`, /has no value/],
    [`"a" "unterminated`, /Unterminated string/],
  ])("rejects malformed input %j", (input, message) => {
    expect(() => parseVdf(input)).toThrow(VdfSyntaxError);
    expect(() => parseVdf(input)).toThrow(message);
  });

  it("returns undefined for non-numeric numbers", () => {
    const doc = parseVdf(`"n" "abc" "e" ""`);
    expect(getNumber(doc, "n")).toBeUndefined();
    expect(getNumber(doc, "e")).toBeUndefined();
  });
});
