import { compactVerify, createLocalJWKSet, type JSONWebKeySet } from "jose";
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

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${url} did not return JSON`);
  }
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
  if (!issuer?.startsWith("https://") && !issuer?.startsWith("http://")) {
    return { state: "unavailable", reason: "No `iss` claim to discover keys from" };
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
  } catch {
    return { state: "invalid" };
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

  for (const [via, key] of candidates) {
    try {
      await compactVerify(token, key);
      return { state: "verified", via };
    } catch {
      continue;
    }
  }
  return { state: "invalid" };
}
