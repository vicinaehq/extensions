import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { isSymmetric, verifyToken, verifyWithSecret } from "./verify.ts";

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

const withFetch = async (handler: typeof fetch, run: () => Promise<unknown>) => {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

// Response.url is a getter, so the post-redirect URL has to be defined rather than assigned.
const jsonResponse = (url: string, body: unknown) => {
  const response = new Response(JSON.stringify(body), { status: 200 });
  Object.defineProperty(response, "url", { value: url });
  return response;
};

test("refuses to discover keys over plaintext http", async () => {
  let called = false;
  const result = await withFetch(
    (async () => {
      called = true;
      throw new Error("should not be reached");
    }) as unknown as typeof fetch,
    () => verifyToken("a.b.c", { alg: "RS256" }, { iss: "http://issuer.test" }),
  );
  assert.deepEqual(result, { state: "unavailable", reason: "The `iss` claim is not an https URL" });
  assert.equal(called, false, "no request should be made for an http issuer");
});

test("rejects a discovery response that redirected off https", async () => {
  const result = await withFetch(
    (async (input: string) =>
      jsonResponse(String(input).replace("https://", "http://"), { jwks_uri: "https://x.test/jwks" })) as unknown as typeof fetch,
    () => verifyToken("a.b.c", { alg: "RS256" }, { iss: "https://issuer.test" }),
  );
  assert.equal((result as { state: string }).state, "unavailable");
  assert.match((result as { reason: string }).reason, /redirected off https/);
});

test("refuses a jwks_uri that is not https", async () => {
  const result = await withFetch(
    (async (input: string) => jsonResponse(String(input), { jwks_uri: "http://issuer.test/jwks" })) as unknown as typeof fetch,
    () => verifyToken("a.b.c", { alg: "RS256" }, { iss: "https://issuer.test" }),
  );
  assert.equal((result as { state: string }).state, "unavailable");
  assert.match((result as { reason: string }).reason, /not https/);
});

test("reports an empty key set as unknown rather than a failed signature", async () => {
  const { privateKey } = await generateKeyPair("RS256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://issuer.test")
    .sign(privateKey);
  const result = await withFetch(
    (async (input: string) => {
      const url = String(input);
      return url.includes(".well-known")
        ? jsonResponse(url, { jwks_uri: "https://issuer.test/jwks" })
        : jsonResponse(url, { keys: [] });
    }) as unknown as typeof fetch,
    () => verifyToken(token, { alg: "RS256" }, { iss: "https://issuer.test" }),
  );
  assert.notEqual((result as { state: string }).state, "invalid");
  assert.equal((result as { state: string }).state, "unknown-key");
});

test("treats a missing iss claim as unavailable", async () => {
  const result = await verifyToken("a.b.c", { alg: "RS256" }, {});
  assert.deepEqual(result, { state: "unavailable", reason: "No `iss` claim to discover keys from" });
});
