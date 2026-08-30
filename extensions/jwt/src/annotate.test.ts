import assert from "node:assert/strict";
import { test } from "node:test";
import { annotate } from "./annotate.ts";

const lineFor = (output: string, key: string) =>
  output.split("\n").find((line) => line.trimStart().startsWith(`"${key}"`))!;

test("explains a registered claim on its own line", () => {
  assert.match(lineFor(annotate({ iss: "https://x.test" }), "iss"), /# Issuer$/);
});

test("renders a timestamp claim as a date alongside its name", () => {
  const line = lineFor(annotate({ iat: 1700000000 }), "iat");
  assert.match(line, /"iat": 1700000000/);
  assert.match(line, /# Issued at · .*\d{4}/);
});

test("leaves an unregistered claim uncommented", () => {
  const line = lineFor(annotate({ "https://example.com/roles": ["editor"] }), "https://example.com/roles");
  assert.doesNotMatch(line, /#/);
});

test("does not comment nested array items", () => {
  const lines = annotate({ aud: ["https://api.example.com", "https://admin.example.com"] }).split("\n");
  const nested = lines.filter((line) => line.includes("example.com"));
  assert.equal(nested.length, 2);
  for (const line of nested) assert.doesNotMatch(line, /#/);
});

test("puts one space between the value and its comment", () => {
  const commented = annotate({ iss: "https://a-very-long-issuer.example.com", sub: "x" })
    .split("\n")
    .filter((line) => line.includes("#"));

  assert.equal(commented.length, 2);
  for (const line of commented) assert.match(line, /[",] # \S/);
  // No padding column: a short line's comment starts earlier than a long one's.
  assert.ok(commented[1]!.indexOf("#") < commented[0]!.indexOf("#"));
});

test("keeps the JSON structure intact around the comments", () => {
  const lines = annotate({ sub: "x" }).split("\n");
  assert.equal(lines[0], "{");
  assert.equal(lines[lines.length - 1], "}");
});
