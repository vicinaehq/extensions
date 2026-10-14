/**
 * Lazy access to Vicinae LocalStorage: a static import of @vicinae/api crashes
 * at module load outside the Vicinae host (its init reads host globals), and
 * unit tests must run under plain tsx. This require only runs on paths the
 * tests never touch (they inject an in-memory store via setTokenStoreForTesting).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
function vicinaeLocalStorage(): typeof import("@vicinae/api").LocalStorage {
  return (require("@vicinae/api") as typeof import("@vicinae/api")).LocalStorage;
}

const localStorageAdapter: TokenStoreAdapter = {
  getItem: (key) => vicinaeLocalStorage().getItem<string>(key),
  setItem: (key, value) => vicinaeLocalStorage().setItem(key, value),
  removeItem: (key) => vicinaeLocalStorage().removeItem(key),
};

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

/** Single namespaced key — Vicinae LocalStorage only holds string|number|boolean, so the set is JSON-serialized. */
export const TOKENS_STORAGE_KEY = "google-calendar:tokens";

export const DEFAULT_TOKEN_SKEW_MS = 60_000;

export interface TokenStoreAdapter {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

let store: TokenStoreAdapter = localStorageAdapter;

/**
 * Test-only seam: replace the Vicinae LocalStorage backend with an in-memory
 * map so unit tests run without a Vicinae host. Pass null to restore.
 * Never call from extension code.
 */
export function setTokenStoreForTesting(adapter: TokenStoreAdapter | null): void {
  store = adapter ?? localStorageAdapter;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await store.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens));
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const raw = await store.getItem(TOKENS_STORAGE_KEY);
  if (raw === undefined || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const t = parsed as Record<string, unknown>;
  if (typeof t["accessToken"] !== "string" || typeof t["expiresAt"] !== "number") return null;
  return {
    accessToken: t["accessToken"],
    refreshToken: typeof t["refreshToken"] === "string" ? t["refreshToken"] : undefined,
    expiresAt: t["expiresAt"],
    scope: typeof t["scope"] === "string" ? t["scope"] : undefined,
    tokenType: typeof t["tokenType"] === "string" ? t["tokenType"] : undefined,
  };
}

export async function clearTokens(): Promise<void> {
  await store.removeItem(TOKENS_STORAGE_KEY);
}

/** Expired when now >= expiresAt - skew. Default skew 60s absorbs clock drift. */
export function isExpired(tokens: StoredTokens, skewMs = DEFAULT_TOKEN_SKEW_MS): boolean {
  return Date.now() >= tokens.expiresAt - skewMs;
}
