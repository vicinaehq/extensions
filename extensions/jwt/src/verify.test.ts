import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { isSymmetric, verifyWithSecret } from "./verify.ts";

const sign = (key: Uint8Array) =>
  new SignJWT({ sub: "user-42" }).setProtectedHeader({ alg: "HS256" }).sign(key);

test("recognises the symmetric algorithms", () => {
  assert.ok(isSymmetric("HS256"));
  assert.ok(isSymmetric("HS512"));
  assert.equal(isSymmetric("RS256"), false);
  assert.equal(isSymmetric(undefined), false);
});

test("verifies a secret written as plain text", async () => {
  const token = await sign(new TextEncoder().encode("correct horse battery staple"));
  assert.deepEqual(await verifyWithSecret(token, "correct horse battery staple"), {
    state: "verified",
    via: "text",
  });
});

test("verifies a secret written as base64url", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const token = await sign(bytes);
  assert.deepEqual(await verifyWithSecret(token, Buffer.from(bytes).toString("base64url")), {
    state: "verified",
    via: "base64url",
  });
});

test("reports a wrong secret as a failed signature", async () => {
  const token = await sign(new TextEncoder().encode("the real secret"));
  assert.deepEqual(await verifyWithSecret(token, "not the secret"), { state: "invalid" });
});

test("treats an empty secret as nothing to check with", async () => {
  const token = await sign(new TextEncoder().encode("s"));
  assert.deepEqual(await verifyWithSecret(token, ""), {
    state: "unavailable",
    reason: "No secret given",
  });
});
