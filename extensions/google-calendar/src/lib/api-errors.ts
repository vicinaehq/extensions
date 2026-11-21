/**
 * Map Google Calendar API failures ({@link GoogleApiError}) to actionable
 * user-facing wording.
 *
 * Host-free on purpose: this module imports only the error class and the
 * secret-redaction helper, never `@vicinae/api`, so it stays unit-testable
 * under plain `tsx`. Unrecognised errors fall back to the raw message so
 * nothing is ever swallowed.
 */

import { GoogleApiError } from "../api/calendar";
import { redactSensitiveText } from "./auth-errors";

const CALENDAR_API_LIBRARY_URL =
  "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com";

function reasonFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const err = (body as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return undefined;
  const errors = (err as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return undefined;
  const first = errors[0] as { reason?: unknown } | undefined;
  return typeof first?.reason === "string" ? first.reason : undefined;
}

/** Prefer the enable URL Google embeds in the error body's help links. */
function enableUrlFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const err = (body as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return undefined;
  const details = (err as { details?: unknown }).details;
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    if (typeof detail !== "object" || detail === null) continue;
    const links = (detail as { links?: unknown }).links;
    if (!Array.isArray(links)) continue;
    for (const link of links) {
      if (typeof link !== "object" || link === null) continue;
      const url = (link as { url?: unknown }).url;
      if (typeof url === "string" && /^https?:\/\//.test(url)) return url;
    }
  }
  return undefined;
}

function urlFromText(text: string): string | undefined {
  const match = /https?:\/\/[^\s"')]+/.exec(text);
  return match ? match[0] : undefined;
}

/**
 * Turn a Google API failure into plain user-facing wording. Non-Google
 * errors pass through unchanged (redacted); unrecognised Google statuses
 * keep the raw message so the detail still reaches the user.
 */
export function formatGoogleApiError(error: unknown): string {
  if (!(error instanceof GoogleApiError)) {
    return error instanceof Error ? redactSensitiveText(error.message) : String(error);
  }
  const raw = redactSensitiveText(error.message);
  const reason = error.reason ?? reasonFromBody(error.body);
  const status = error.status;

  if (
    status === 403 &&
    (reason === "accessNotConfigured" ||
      /accessNotConfigured|has not been used in project|is disabled/i.test(error.message))
  ) {
    const url =
      enableUrlFromBody(error.body) ?? urlFromText(error.message) ?? CALENDAR_API_LIBRARY_URL;
    return (
      "The Google Calendar API is not enabled for your Google Cloud project (Google API error 403: " +
      "Calendar API has not been used in this project before or it is disabled). " +
      `Enable it at ${url}, wait ~1–2 minutes for the change to propagate, then retry — no re-sign-in is needed. ` +
      `Google said: "${raw}".`
    );
  }

  if (
    status === 403 &&
    (reason === "insufficientPermissions" ||
      /insufficient authentication scopes|insufficientPermissions/i.test(error.message))
  ) {
    return (
      "Google refused the request for lack of permission (403 insufficient authentication scopes): the stored token " +
      "was issued for a different OAuth client or scope set. Sign out and sign in again to mint a fresh token. " +
      `Google said: "${raw}".`
    );
  }

  if (status === 401) {
    return (
      "Your Google session expired (401) — sign in again. The extension already attempted one silent refresh " +
      "before showing this, so reaching this message means that refresh failed. " +
      `Google said: "${raw}".`
    );
  }

  if (status === 404 && (reason === "notFound" || /notFound/i.test(error.message))) {
    return (
      "The calendar was not found (404 notFound): the calendar ID does not exist or is not accessible to your " +
      "account. Check the defaultCalendarId preference. " +
      `Google said: "${raw}".`
    );
  }

  if (
    status === 429 ||
    (typeof reason === "string" && /rateLimitExceeded|userRateLimitExceeded/i.test(reason)) ||
    /rateLimitExceeded|userRateLimitExceeded|rate limit/i.test(error.message)
  ) {
    return (
      `Google rate-limited the request (${status}). Wait a moment and retry. ` +
      `Google said: "${raw}".`
    );
  }

  if (status >= 500 && status < 600) {
    return (
      `Google's servers returned a transient error (HTTP ${status}). Retry shortly. ` +
      `Google said: "${raw}".`
    );
  }

  return raw;
}
