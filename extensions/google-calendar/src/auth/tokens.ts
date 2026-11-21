/**
 * Google OAuth token persistence via Vicinae's secure OAuth token store.
 *
 * The browser authorization itself is custom (a PKCE + loopback-redirect
 * flow in `google-oauth.ts`/`loopback.ts`): `OAuth.PKCEClient.authorize`
 * only supports raycast.com / `raycast://` / `com.raycast:/` redirect URIs,
 * which Google's Desktop-app client type does not accept. But token
 * *storage* goes through a stable, module-level `OAuth.PKCEClient`
 * instance's `setTokens` / `getTokens` / `removeTokens` — never through
 * `LocalStorage`.
 *
 * A static import of `@vicinae/api` crashes at module load outside the
 * Vicinae host (its init reads host globals), and unit tests must run under
 * plain tsx. So the client is created lazily via `require` on paths the
 * tests never touch (they inject an in-memory backend via
 * `setTokenStoreForTesting` that implements the same `setTokens` /
 * `getTokens` / `removeTokens` shape).
 */

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: number;
  scope?: string;
}

/** Minimal structural input for `OAuth.PKCEClient.setTokens` (host-free). */
export interface TokenSetInput {
  accessToken: string;
  refreshToken?: string;
  /** Lifetime in seconds, as returned by Google's `expires_in`. */
  expiresIn?: number;
  scope?: string;
}

/**
 * Minimal structural view of the `OAuth.TokenSet` returned by
 * `OAuth.PKCEClient.getTokens` (host-free). `updatedAt` anchors the
 * relative `expiresIn` to a wall-clock instant; `isExpired()` is the API's
 * own expiry signal.
 */
export interface PersistedTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  updatedAt: Date;
  isExpired(): boolean;
}

/**
 * Host-free backend shape mirroring the three `OAuth.PKCEClient` token
 * methods. The production backend IS the stable module-level PKCEClient;
 * tests inject an in-memory implementation of this interface.
 */
export interface TokenStoreAdapter {
  setTokens(tokens: TokenSetInput): Promise<void>;
  getTokens(): Promise<PersistedTokenSet | undefined>;
  removeTokens(): Promise<void>;
}

export const DEFAULT_TOKEN_SKEW_MS = 60_000;
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

/**
 * The stable token-store identity: one module-level `OAuth.PKCEClient`
 * created on first use, so every command run reads and writes the same
 * token set. `authorize` is never called on it — only the token-storage
 * methods — so the redirect method is irrelevant to the flow and only
 * satisfies the constructor's required options.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pkceClient: any | undefined;

function productionStore(): TokenStoreAdapter {
  if (!pkceClient) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require("@vicinae/api") as typeof import("@vicinae/api");
    pkceClient = new api.OAuth.PKCEClient({
      redirectMethod: api.OAuth.RedirectMethod.App,
      providerName: "Google",
      description: "Sign in with Google to access your calendars.",
    });
  }
  return pkceClient as TokenStoreAdapter;
}

let storeOverride: TokenStoreAdapter | null = null;

function activeStore(): TokenStoreAdapter {
  return storeOverride ?? productionStore();
}

/**
 * Test-only seam: replace the `OAuth.PKCEClient` backend with an in-memory
 * implementation of the same `setTokens`/`getTokens`/`removeTokens` shape
 * so unit tests run without a Vicinae host. Pass null to restore.
 * Never call from extension code.
 */
export function setTokenStoreForTesting(adapter: TokenStoreAdapter | null): void {
  storeOverride = adapter;
}

/**
 * Persist tokens through `OAuth.PKCEClient.setTokens`. The public
 * `StoredTokens` shape carries an absolute `expiresAt`; the OAuth store
 * carries a relative `expiresIn`, so the lifetime is converted back to
 * seconds here and re-anchored to the store's `updatedAt` on load.
 */
export async function saveTokens(tokens: StoredTokens): Promise<void> {
  const expiresIn = Math.max(
    0,
    Math.round((tokens.expiresAt - Date.now()) / 1000),
  );
  await activeStore().setTokens({
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken !== undefined ? { refreshToken: tokens.refreshToken } : {}),
    expiresIn,
    ...(tokens.scope !== undefined ? { scope: tokens.scope } : {}),
  });
}

/**
 * Read tokens through `OAuth.PKCEClient.getTokens`, re-anchoring the
 * relative `expiresIn` to the store's `updatedAt` so callers keep a
 * wall-clock `expiresAt`. Returns null when nothing is stored or the
 * stored set has no access token.
 */
export async function loadTokens(): Promise<StoredTokens | null> {
  const set = await activeStore().getTokens();
  if (!set || typeof set.accessToken !== "string" || set.accessToken.length === 0) {
    return null;
  }
  const expiresIn =
    typeof set.expiresIn === "number" && Number.isFinite(set.expiresIn) && set.expiresIn >= 0
      ? set.expiresIn
      : DEFAULT_EXPIRES_IN_SECONDS;
  const updatedAtMs =
    set.updatedAt instanceof Date && !Number.isNaN(set.updatedAt.getTime())
      ? set.updatedAt.getTime()
      : Date.now();
  return {
    accessToken: set.accessToken,
    ...(typeof set.refreshToken === "string" ? { refreshToken: set.refreshToken } : {}),
    expiresAt: updatedAtMs + expiresIn * 1000,
    ...(typeof set.scope === "string" ? { scope: set.scope } : {}),
  };
}

export async function clearTokens(): Promise<void> {
  await activeStore().removeTokens();
}

/** Expired when now >= expiresAt - skew. Default skew 60s absorbs clock drift. */
export function isExpired(tokens: StoredTokens, skewMs = DEFAULT_TOKEN_SKEW_MS): boolean {
  return Date.now() >= tokens.expiresAt - skewMs;
}
