import { createHash, randomBytes } from "node:crypto";

/**
 * Create a PKCE code verifier per RFC 7636 §4.1: 43–128 characters from
 * [A-Za-z0-9-._~]. randomBytes rendered as base64url only emits
 * [A-Za-z0-9-_], a valid subset. Default 32 bytes -> 43 characters.
 */
export function createCodeVerifier(byteLength = 32): string {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new RangeError(`byteLength must be a positive integer, got ${byteLength}`);
  }
  return randomBytes(byteLength).toString("base64url");
}

/** S256 challenge per RFC 7636 §4.2: base64url(sha256(verifier)), no padding. */
export function createCodeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

/** Opaque CSRF token for the OAuth `state` parameter. */
export function createState(): string {
  return randomBytes(16).toString("base64url");
}
