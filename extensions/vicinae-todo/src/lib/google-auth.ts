import { LocalStorage, getPreferenceValues, open } from "@vicinae/api";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { AddressInfo } from "node:net";

const TOKENS_KEY = "google-tokens";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/tasks";
const AUTH_TIMEOUT_MS = 3 * 60 * 1000;

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
}

const CONFIG_KEY = "google-config";

interface Preferences {
  clientId?: string;
  clientSecret?: string;
  listName?: string;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  listName: string;
}

/**
 * Credentials live in LocalStorage (set via the in-app "Configure Google
 * Sync" form) because Vicinae currently has no settings UI for optional
 * extension preferences. Manifest preferences are kept as a fallback for
 * when that UI lands.
 */
export async function getGoogleConfig(): Promise<GoogleConfig> {
  let stored: Partial<GoogleConfig> = {};
  const raw = await LocalStorage.getItem<string>(CONFIG_KEY);
  if (raw) {
    try {
      stored = JSON.parse(raw) as Partial<GoogleConfig>;
    } catch {
      // ignore corrupt config
    }
  }
  const prefs = getPreferenceValues<Preferences>();
  return {
    clientId: stored.clientId?.trim() || prefs.clientId?.trim() || "",
    clientSecret: stored.clientSecret?.trim() || prefs.clientSecret?.trim() || "",
    listName: stored.listName?.trim() || prefs.listName?.trim() || "Vicinae",
  };
}

export async function saveGoogleConfig(config: GoogleConfig): Promise<void> {
  await LocalStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function hasGoogleCredentials(): Promise<boolean> {
  const { clientId, clientSecret } = await getGoogleConfig();
  return Boolean(clientId && clientSecret);
}

export async function isSignedIn(): Promise<boolean> {
  return Boolean(await LocalStorage.getItem<string>(TOKENS_KEY));
}

export async function signOut(): Promise<void> {
  await LocalStorage.removeItem(TOKENS_KEY);
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Wait for Google to redirect back to a one-shot local HTTP server. */
function waitForAuthCode(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for Google sign-in"));
    }, AUTH_TIMEOUT_MS);

    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (!code && !error) {
        // Ignore favicon and other stray requests.
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body style="font-family: sans-serif; text-align: center; padding-top: 4em;">
          <h2>${code ? "Signed in!" : "Sign-in failed"}</h2>
          <p>You can close this tab and return to Vicinae.</p>
        </body></html>`,
      );
      clearTimeout(timer);
      server.close();
      if (code) resolve(code);
      else reject(new Error(`Google sign-in failed: ${error}`));
    });
  });
}

async function exchangeToken(params: Record<string, string>): Promise<StoredTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? `Token request failed (${res.status})`);
  }
  const existing = await getStoredTokens();
  const tokens: StoredTokens = {
    accessToken: data.access_token,
    // Refresh responses don't echo the refresh token back; keep the old one.
    refreshToken: data.refresh_token ?? existing?.refreshToken ?? "",
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await LocalStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

async function getStoredTokens(): Promise<StoredTokens | undefined> {
  const raw = await LocalStorage.getItem<string>(TOKENS_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return undefined;
  }
}

/**
 * Full sign-in: PKCE + loopback redirect, the standard OAuth flow for
 * desktop apps. Opens the consent screen in the browser and captures the
 * redirect on a temporary 127.0.0.1 server.
 */
export async function authorize(): Promise<StoredTokens> {
  const { clientId, clientSecret } = await getGoogleConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Set the Google OAuth client ID and secret via the Configure Google Sync action");
  }

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());

  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const authUrl = new URL(AUTH_URL);
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  }).toString();

  const codePromise = waitForAuthCode(server);
  await open(authUrl.toString());
  const code = await codePromise;

  return exchangeToken({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
}

/** Return a valid access token, refreshing or re-authorizing as needed. */
export async function getValidToken(): Promise<string> {
  const tokens = await getStoredTokens();
  if (!tokens) return (await authorize()).accessToken;
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken;

  const { clientId, clientSecret } = await getGoogleConfig();
  try {
    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    return refreshed.accessToken;
  } catch {
    // Refresh token revoked or expired — start over.
    await signOut();
    return (await authorize()).accessToken;
  }
}
