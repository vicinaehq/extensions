import assert from "node:assert/strict";
import { test } from "node:test";
import { CLAIM_NAMES, orderClaims, TIME_CLAIMS } from "./claims.ts";

test("names registered claims", () => {
  assert.equal(CLAIM_NAMES.iat, "Issued at");
  assert.equal(CLAIM_NAMES.azp, "Authorized party");
  assert.equal(CLAIM_NAMES["x5t#S256"], "X.509 thumbprint");
});

test("leaves custom claims unnamed", () => {
  assert.equal(CLAIM_NAMES["https://example.com/roles"], undefined);
});

test("orders priority claims first, then the rest alphabetically", () => {
  assert.deepEqual(orderClaims(["zzz", "exp", "aaa", "iss"]), ["iss", "exp", "aaa", "zzz"]);
});

test("names every time claim", () => {
  for (const claim of TIME_CLAIMS) assert.ok(CLAIM_NAMES[claim], `${claim} is unnamed`);
});
