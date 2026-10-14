import { createCalendarClient, type GoogleCalendarClient } from "../api/calendar";
import { getAccessToken } from "../auth/google-oauth";

/**
 * Memoized Google Calendar client for UI code.
 *
 * The client is a thin fetch wrapper with no per-user state besides the
 * access-token callback, so a single process-wide instance is enough.
 * Sign-out does not need to reset it: the next `getAccessToken()` call
 * simply throws `NotAuthenticatedError` and every command falls back to
 * the unauthenticated view.
 */

let cached: GoogleCalendarClient | undefined;

export function getCalendarClient(): GoogleCalendarClient {
  if (!cached) {
    cached = createCalendarClient({ getAccessToken });
  }
  return cached;
}

/** Test-only seam: drop the memoized instance. Never call from UI code. */
export function resetCalendarClientForTesting(): void {
  cached = undefined;
}
