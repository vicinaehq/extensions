import { getExtensionPreferences } from "../preferences";
import { buildAuthorizationUrl, waitForAuthorizationCode } from "./loopback";
import { createCodeChallengeS256, createCodeVerifier, createState } from "./pkce";
import { clearTokens, isExpired, loadTokens, saveTokens, type StoredTokens } from "./tokens";

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Deliberately calendar-only (no Contacts/People API) so the consent screen stays narrow.
export const GOOGLE_SCOPES: string[] = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
  "profile",
];

const DEFAULT_LOOPBACK_PORT = 8765;
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export class NotAuthenticatedError extends Error {
  constructor(message = "Not signed in with Google. Please sign in first.") {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

export class MissingClientIdError extends Error {
  constructor(
    message = "Google OAuth Client ID is not set. Open extension preferences and enter the Client ID of your Google Cloud “Desktop app” OAuth client.",
  ) {
    super(message);
    this.name = "MissingClientIdError";
  }
}

type FetchImplementation = (url: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: FetchImplementation = (url, init) => fetch(url, init);
let fetchImpl: FetchImplementation = defaultFetch;

/**
 * Test-only seam: stub the network layer so unit tests can exercise the token
 * exchange without hitting Google. Pass null to restore the global fetch.
 * Never call from extension code.
 */
export function setFetchImplementationForTesting(fn: FetchImplementation | null): void {
  fetchImpl = fn ?? defaultFetch;
}

interface GoogleClientConfig {
  googleClientId?: string;
  googleClientSecret?: string;
  refreshToken?: string;
}

let preferencesOverride: GoogleClientConfig | null = null;

/**
 * Test-only seam: bypass Vicinae getPreferenceValues (unavailable outside the
 * host) in unit tests. Pass null to restore. Never call from extension code.
 */
export function setPreferencesForTesting(prefs: GoogleClientConfig | null): void {
  preferencesOverride = prefs;
}

function readClientConfig(): GoogleClientConfig {
  if (preferencesOverride) return preferencesOverride;
  const prefs = getExtensionPreferences();
  return {
    googleClientId: prefs.googleClientId,
    googleClientSecret: prefs.googleClientSecret,
    refreshToken: prefs.refreshToken,
  };
}

/**
 * Lazy browser open: a static import of @vicinae/api crashes at module load
 * outside the Vicinae host, and unit tests must run under plain tsx. Only
 * called from startBrowserAuthorization (browser flow), never from tests.
 */
function openInBrowser(url: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api = require("@vicinae/api") as typeof import("@vicinae/api");
  return api.open(url);
}

export function getGoogleClientId(): string {
  const { googleClientId } = readClientConfig();
  if (!googleClientId) throw new MissingClientIdError();
  return googleClientId;
}

interface TokenEndpointResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

class TokenRequestError extends Error {
  readonly status: number;
  readonly errorCode?: string;
  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.name = "TokenRequestError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

/** Single choke point for token HTTP so errors always carry Google's body. */
async function postToTokenEndpoint(params: Record<string, string>): Promise<TokenEndpointResponse> {
  let res: Response;
  try {
    res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
  } catch (err) {
    throw new Error(
      `Google token request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const text = await res.text();
  let data: TokenEndpointResponse;
  try {
    data = JSON.parse(text) as TokenEndpointResponse;
  } catch {
    throw new Error(`Google token endpoint returned a non-JSON response (HTTP ${res.status})`);
  }
  if (!res.ok || typeof data.access_token !== "string") {
    const detail = data.error_description || data.error || text.slice(0, 500);
    throw new TokenRequestError(
      res.status,
      `Google token request failed (HTTP ${res.status}): ${detail}`,
      data.error,
    );
  }
  return data;
}

function toStoredTokens(
  data: TokenEndpointResponse,
  previousRefreshToken?: string,
): StoredTokens {
  const expiresIn =
    typeof data.expires_in === "number" && Number.isFinite(data.expires_in)
      ? data.expires_in
      : DEFAULT_EXPIRES_IN_SECONDS;
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

function withOptionalSecret(params: Record<string, string>): Record<string, string> {
  const { googleClientSecret } = readClientConfig();
  if (googleClientSecret) params["client_secret"] = googleClientSecret;
  return params;
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await loadTokens();
  return tokens !== null && tokens.accessToken.length > 0;
}

/**
 * Bootstraps a session from the pasted `refreshToken` preference when no
 * stored tokens exist. Entrypoints call this on boot before checking
 * isAuthenticated()/getAccessToken().
 *
 * Returns true when a usable session exists (stored tokens, or the pasted
 * refresh token exchanged successfully). Returns false when simply not
 * authenticated — never throws for that case. Throws MissingClientIdError
 * only when a refresh token is configured but the Client ID is missing.
 */
export async function ensureSession(): Promise<boolean> {
  const tokens = await loadTokens();
  if (tokens !== null && tokens.accessToken.length > 0) return true;
  const { googleClientId, refreshToken } = readClientConfig();
  if (!refreshToken) return false;
  if (!googleClientId) {
    throw new MissingClientIdError(
      "Google refresh-token exchange requires the Client ID of your Google Cloud “Desktop app” OAuth client. Open extension preferences and enter it, then try again.",
    );
  }
  try {
    await authenticateWithRefreshToken(refreshToken);
    return true;
  } catch (err) {
    if (err instanceof MissingClientIdError) throw err;
    return false;
  }
}

/**
 * Marks the cached access token as expired so the next getAccessToken()
 * performs a refresh_token exchange. The API client calls this after an
 * HTTP 401 before retrying the request once. Never throws when there is
 * simply nothing to invalidate.
 */
export async function invalidateAccessToken(): Promise<void> {
  const tokens = await loadTokens();
  if (!tokens) return;
  if (!tokens.refreshToken) {
    await clearTokens();
    return;
  }
  await saveTokens({ ...tokens, expiresAt: 0 });
}

// Single-flight guard: concurrent getAccessToken() calls share one refresh
// POST so token rotation cannot invalidate a sibling request's refresh token.
// Cleared on settle (see below) so a failure rejects all waiters without
// poisoning later calls.
let inFlightRefresh: Promise<string> | null = null;

function clearInFlightIfCurrent(task: Promise<string>): void {
  if (inFlightRefresh === task) inFlightRefresh = null;
}

async function refreshAccessToken(refreshToken: string | undefined): Promise<string> {
  if (!refreshToken) {
    await clearTokens();
    throw new NotAuthenticatedError("Google session expired. Please sign in again.");
  }
  const params = withOptionalSecret({
    grant_type: "refresh_token",
    client_id: getGoogleClientId(),
    refresh_token: refreshToken,
  });
  let data: TokenEndpointResponse;
  try {
    data = await postToTokenEndpoint(params);
  } catch (err) {
    if (err instanceof TokenRequestError && (err.status === 400 || err.status === 401)) {
      // invalid_grant: revoked/rotated refresh token — nothing left to retry with.
      await clearTokens();
      throw new NotAuthenticatedError("Google session expired or was revoked. Please sign in again.");
    }
    throw err;
  }
  const next = toStoredTokens(data, refreshToken);
  await saveTokens(next);
  return next.accessToken;
}

export async function getAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new NotAuthenticatedError();
  if (!isExpired(tokens)) return tokens.accessToken;
  if (inFlightRefresh) return inFlightRefresh;
  const task = refreshAccessToken(tokens.refreshToken);
  inFlightRefresh = task;
  task.then(
    () => clearInFlightIfCurrent(task),
    () => clearInFlightIfCurrent(task),
  );
  return task;
}

export async function startBrowserAuthorization(): Promise<void> {
  const clientId = getGoogleClientId();
  const verifier = createCodeVerifier();
  const challenge = createCodeChallengeS256(verifier);
  const state = createState();
  let redirectUri = "";
  const { code } = await waitForAuthorizationCode({
    expectedState: state,
    preferredPort: DEFAULT_LOOPBACK_PORT,
    onListening: async (uri) => {
      redirectUri = uri;
      await openInBrowser(
        buildAuthorizationUrl({
          clientId,
          redirectUri: uri,
          codeChallenge: challenge,
          state,
          scopes: GOOGLE_SCOPES,
        }),
      );
    },
  });
  const data = await postToTokenEndpoint(
    withOptionalSecret({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  );
  await saveTokens(toStoredTokens(data));
}

export async function authenticateWithRefreshToken(refreshToken: string): Promise<void> {
  const clientId = getGoogleClientId();
  let data: TokenEndpointResponse;
  try {
    data = await postToTokenEndpoint(
      withOptionalSecret({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not authenticate with that refresh token: ${detail}. Check that the refresh token and Google Client ID are correct.`,
    );
  }
  await saveTokens(toStoredTokens(data, refreshToken));
}

export async function signOut(): Promise<void> {
  await clearTokens();
}
