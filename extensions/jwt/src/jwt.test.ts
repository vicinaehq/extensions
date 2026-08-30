import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeJwt, formatClaimTime, formatClaimTimeCompact, tokenStatus } from "./jwt.ts";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const make = (h: unknown, p: unknown, sig = "c2ln") => `${b64(h)}.${b64(p)}.${sig}`;

test("decodes a well-formed token", () => {
  const token = make({ alg: "RS256", typ: "JWT", kid: "k1" }, { sub: "abc", exp: 4102444800 });
  const result = decodeJwt(token);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.header, { alg: "RS256", typ: "JWT", kid: "k1" });
  assert.equal(result.payload.sub, "abc");
  assert.equal(result.signature, "c2ln");
  assert.equal(result.token, token);
});

test("tolerates surrounding whitespace and a Bearer prefix", () => {
  const token = make({ alg: "none" }, { sub: "x" });
  const result = decodeJwt(`  Bearer ${token}\n`);
  assert.equal(result.ok, true);
  // The normalized token is what gets verified and re-copied, so the prefix must be gone.
  if (result.ok) assert.equal(result.token, token);
});

test("accepts an unsecured token with an empty signature", () => {
  const result = decodeJwt(`${b64({ alg: "none" })}.${b64({ sub: "x" })}.`);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.signature, "");
});

test("rejects a wrong segment count", () => {
  const result = decodeJwt("a.b");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /three/i);
});

test("rejects a segment that is not JSON", () => {
  const result = decodeJwt(`${Buffer.from("nope").toString("base64url")}.${b64({})}.s`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /header/i);
});

test("rejects empty input", () => {
  assert.equal(decodeJwt("   ").ok, false);
});

test("classifies expiry", () => {
  const now = 1_700_000_000;
  assert.equal(tokenStatus({ exp: now + 60 }, now).label, "Active");
  assert.equal(tokenStatus({ exp: now - 60 }, now).label, "Expired");
  assert.equal(tokenStatus({ nbf: now + 60 }, now).label, "Not yet active");
  assert.equal(tokenStatus({}, now).label, "No expiry");
});

test("renders a claim time as absolute plus relative", () => {
  const now = 1_700_000_000;
  assert.match(formatClaimTime(now + 2820, now), /in 47 minutes$/);
  assert.match(formatClaimTime(now - 2820, now), /47 minutes ago$/);
  assert.equal(formatClaimTime("not-a-number", now), "not-a-number");
});

test("drops the year from a compact claim time within the current year", () => {
  const now = 1_700_000_000;
  const compact = formatClaimTimeCompact(now + 3600, now);
  assert.doesNotMatch(compact, /2023/);
  assert.match(compact, /in 1 hour$/);
});

test("keeps the year on a compact claim time from another year", () => {
  const now = 1_700_000_000;
  assert.match(formatClaimTimeCompact(now + 86_400 * 400, now), /2024/);
});
