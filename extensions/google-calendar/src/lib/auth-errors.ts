/**
 * Pure helpers for the unauthenticated view's refresh-token boot attempt and
 * the browser (PKCE loopback) sign-in flow.
 *
 * Kept here — not in the auth module, not in the component — so the
 * decision and the error wording stay unit-testable without the Vicinae
 * runtime or React rendering. Nothing here ever sees a token value, so
 * nothing here can log one; as a backstop, raw Google detail appended to a
 * message is passed through {@link redactSensitiveText} first.
 */

/**
 * Decide whether the unauthenticated view should auto-attempt the
 * refresh-token exchange on mount. The component guards the call itself
 * with a ref so it fires at most once; this helper holds the pure part
 * of that decision.
 */
export function shouldAutoAttemptRefreshToken(
  preferenceToken: string | undefined,
  alreadyAttempted: boolean,
): boolean {
  if (alreadyAttempted) return false;
  return typeof preferenceToken === "string" && preferenceToken.length > 0;
}

/**
 * Redact token/secret-shaped values from free-form Google error text before
 * it is shown to the user. Covers installed-app refresh tokens (`1//…`),
 * access tokens (`ya29.…`), Google-issued client secrets (`GOCSPX-…`),
 * API keys (`AIza…`), and `name=value` secret parameters.
 */
export function redactSensitiveText(text: string): string {
  return text
    .replace(/1\/\/\S+/g, "1//<redacted>")
    .replace(/ya29\.[A-Za-z0-9\-_]+/g, "ya29.<redacted>")
    .replace(/GOCSPX-[A-Za-z0-9\-_]+/g, "GOCSPX-<redacted>")
    .replace(/AIza[A-Za-z0-9\-_]{10,}/g, "<redacted-api-key>")
    .replace(
      /(client[_-]?secret|refresh[_-]?token|access[_-]?token|code[_-]?verifier)(\s*[:=]\s*|\s+)(["']?)[^\s"'&;,]+(["']?)/gi,
      "$1$2<redacted>",
    );
}

/**
 * Shared unauthenticated-session predicate for every command boundary.
 *
 * True for both ways a Google session ends: a rejected refresh that cleared
 * the stored tokens (`NotAuthenticatedError` from the auth module) and a
 * live API call rejected with HTTP 401 (`GoogleApiError` with
 * `status === 401`). Command boot handlers AND mid-flight catch paths must
 * use this — checking only the 401 case leaves a rejected-refresh session
 * stuck in a ready/error state instead of the sign-in view.
 *
 * Host-free on purpose (name + status duck-typing, no imports), so unit
 * tests run without the Vicinae runtime.
 */
export function isUnauthenticatedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: unknown; status?: unknown };
  if (err.name === "NotAuthenticatedError") return true;
  return err.name === "GoogleApiError" && err.status === 401;
}

/**
 * Shared OAuth error-code mapper used by both {@link formatRefreshTokenError}
 * and {@link formatBrowserAuthError}. Returns the actionable message, or
 * null when the input matches no known code (caller falls back to the raw,
 * redacted message).
 */
function mapOAuthErrorCode(message: string): string | null {
  const raw = redactSensitiveText(message);

  if (/access_denied/i.test(message)) {
    return (
      "Google denied the sign-in (access_denied). Three common causes: " +
      "(1) your Google account is not listed as a test user — add it under Google Auth Platform → Audience → Test users " +
      "(older console UI: APIs & Services → OAuth consent screen); " +
      '(2) the consent screen user type is "Internal" and your account is outside that Workspace organization — sign in with an org account or switch the user type to External; ' +
      "(3) a Workspace admin policy blocks this unverified app — ask your admin to allow it. " +
      `Google said: "${raw}".`
    );
  }
  if (/redirect_uri_mismatch/i.test(message)) {
    return (
      "Google rejected the redirect (redirect_uri_mismatch): the OAuth client must be created as type Desktop app, " +
      "not Web application. A Desktop-app client allows the loopback redirect on http://127.0.0.1 with an ephemeral " +
      "port and needs no redirect-URI registration; a Web-application client cannot work with this flow. " +
      `Google said: "${raw}".`
    );
  }
  if (/invalid_client/i.test(message)) {
    return (
      "Google rejected the OAuth client (invalid_client): the Client ID in the extension preferences is wrong or " +
      "truncated — compare it character-for-character with the Google Cloud console value — or this client type " +
      "requires the client secret, so paste that into the preferences too. " +
      `Google said: "${raw}".`
    );
  }
  if (/invalid_grant/i.test(message)) {
    return "Google rejected the refresh token: it may belong to a different OAuth client, or the app may be in Testing mode with an expired token. Mint a refresh token for the same Client ID stored in the extension preferences (see scripts/get-refresh-token.mjs) and try again.";
  }
  return null;
}

/**
 * Turn a refresh-token exchange failure into plain user-facing wording.
 * Only the error message is used — the token value is never interpolated.
 */
export function formatRefreshTokenError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === "MissingClientIdError") {
    return "Google Client ID is missing. Set your Google OAuth Client ID in the extension preferences, then try again.";
  }
  return mapOAuthErrorCode(message) ?? redactSensitiveText(message);
}

/**
 * Turn a browser (PKCE loopback) sign-in failure into plain user-facing
 * wording. Covers the consent-screen codes Google returns via the loopback
 * redirect (`access_denied`, `redirect_uri_mismatch`) as well as token-endpoint
 * codes from the code exchange (`invalid_client`, `invalid_grant`).
 * Unknown errors pass through with sensitive values redacted.
 */
export function formatBrowserAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === "MissingClientIdError") {
    return "Google Client ID is missing. Set your Google OAuth Client ID in the extension preferences, then try again.";
  }
  return mapOAuthErrorCode(message) ?? redactSensitiveText(message);
}
