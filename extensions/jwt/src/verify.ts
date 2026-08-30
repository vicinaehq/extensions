import { compactVerify, createLocalJWKSet, errors, type JSONWebKeySet } from "jose";
import type { Claims } from "./jwt.ts";

export type Verification =
  | { state: "verified"; via?: string }
  | { state: "invalid" }
  | { state: "unknown-key" }
  | { state: "unsupported"; reason: string }
  | { state: "unavailable"; reason: string };

/** HS256/384/512 are HMAC over a shared secret, so there is no public key to fetch. */
export const isSymmetric = (alg: unknown) => typeof alg === "string" && alg.startsWith("HS");

export const discoveryUrl = (issuer: string) =>
  `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

/**
 * Signing keys are only trustworthy over a channel nobody can tamper with: an on-path
 * attacker who can rewrite the discovery document or the key set can have a forged token
 * report as verified. Redirects are followed but the final URL is checked too, so an
 * https URL cannot be downgraded on the way.
 */
async function getJson<T>(url: string): Promise<T> {
  if (!url.startsWith("https://")) throw new Error(`${url} is not https`);

  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.url.startsWith("https://")) throw new Error(`${url} redirected off https`);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${url} did not return JSON`);
  }
}

/**
 * Only a signature that was checked against a key and did not match is a failure. Anything
 * else, a key that could not be selected or an algorithm jose will not handle, means the
 * check never completed and must not be reported as a bad token.
 */
function classify(error: unknown): Verification {
  if (error instanceof errors.JWSSignatureVerificationFailed) return { state: "invalid" };
  if (error instanceof errors.JWKSNoMatchingKey) return { state: "unknown-key" };
  if (error instanceof errors.JWKSMultipleMatchingKeys) {
    return { state: "unavailable", reason: "The key set has several keys and the token names none" };
  }
  if (error instanceof errors.JWKSInvalid || error instanceof errors.JWKInvalid) {
    return { state: "unavailable", reason: "The issuer published a malformed key set" };
  }
  if (error instanceof errors.JOSENotSupported || error instanceof errors.JOSEAlgNotAllowed) {
    return { state: "unsupported", reason: (error as Error).message };
  }
  return { state: "unavailable", reason: (error as Error).message };
}

export async function verifyToken(
  token: string,
  header: Claims,
  payload: Claims,
): Promise<Verification> {
  const alg = typeof header.alg === "string" ? header.alg : undefined;
  const kid = typeof header.kid === "string" ? header.kid : undefined;

  if (!alg || alg === "none") return { state: "unsupported", reason: "The token is unsigned" };
  if (isSymmetric(alg)) {
    return { state: "unsupported", reason: `${alg} needs a shared secret, not a published key` };
  }

  const issuer = typeof payload.iss === "string" ? payload.iss : undefined;
  if (!issuer) return { state: "unavailable", reason: "No `iss` claim to discover keys from" };
  if (!issuer.startsWith("https://")) {
    return { state: "unavailable", reason: "The `iss` claim is not an https URL" };
  }

  let jwks: JSONWebKeySet;
  try {
    const discovery = await getJson<{ jwks_uri?: string }>(discoveryUrl(issuer));
    if (!discovery.jwks_uri) {
      return { state: "unavailable", reason: "Discovery document has no `jwks_uri`" };
    }
    jwks = await getJson<JSONWebKeySet>(discovery.jwks_uri);
  } catch (error) {
    return { state: "unavailable", reason: (error as Error).message };
  }

  if (kid && !jwks.keys.some((key) => key.kid === kid)) return { state: "unknown-key" };

  try {
    await compactVerify(token, createLocalJWKSet(jwks));
    return { state: "verified" };
  } catch (error) {
    return classify(error);
  }
}

/**
 * A shared secret is written down either as raw text or base64url, and the token gives no
 * hint which. Both are tried, and the one that matched is reported back.
 */
export async function verifyWithSecret(token: string, secret: string): Promise<Verification> {
  if (!secret) return { state: "unavailable", reason: "No secret given" };

  const candidates: [string, Uint8Array][] = [["text", new TextEncoder().encode(secret)]];
  try {
    const decoded = Buffer.from(secret, "base64url");
    if (decoded.length && Buffer.from(decoded).toString("base64url") === secret) {
      candidates.push(["base64url", new Uint8Array(decoded)]);
    }
  } catch {
    // Not base64url; the raw-text reading is the only one left to try.
  }

  let mismatch = false;
  for (const [via, key] of candidates) {
    try {
      await compactVerify(token, key);
      return { state: "verified", via };
    } catch (error) {
      if (error instanceof errors.JWSSignatureVerificationFailed) mismatch = true;
      else return classify(error);
    }
  }
  return mismatch
    ? { state: "invalid" }
    : { state: "unavailable", reason: "The signature could not be checked" };
}
