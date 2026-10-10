import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import { parseGrokCredits, parseGrokSettingsTier } from "./parser.ts";
import type { GrokError, GrokUsage } from "./types.ts";

const GROK_BILLING_API = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const GROK_SETTINGS_API = "https://cli-chat-proxy.grok.com/v1/settings";
const REQUEST_TIMEOUT = 15000;
const SETTINGS_TIMEOUT = 3000;

export interface GrokCredential {
  token: string;
  email?: string;
  authMode?: string;
  /** "team" principals have no supported usage surface — identity only. */
  principalType?: string;
}

function cleanToken(token: string | undefined): string | null {
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

function expiryMs(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? value : value * 1000;
  }
  return null;
}

/**
 * Read the Grok CLI credential from `~/.grok/auth.json` (GROK_HOME overrides).
 * Entries are keyed by OIDC scope URL; SuperGrok (auth.x.ai) wins over the
 * legacy accounts.x.ai session. Expired tokens are skipped — the CLI owns
 * refresh. Never throws, never logs token material.
 */
export function readGrokAuthFile(homeDir: string = os.homedir()): GrokCredential | null {
  try {
    const grokHome = process.env.GROK_HOME?.trim() || path.join(homeDir, ".grok");
    const authPath = path.join(grokHome, "auth.json");
    if (!fs.existsSync(authPath)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(authPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const entries = Object.entries(parsed as Record<string, unknown>);
    const ordered = entries.sort(([scopeA], [scopeB]) => {
      const score = (scope: string) => (scope.includes("auth.x.ai") ? 0 : scope.includes("accounts.x.ai") ? 1 : 2);
      return score(scopeA) - score(scopeB);
    });

    const now = Date.now();
    for (const [, raw] of ordered) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const record = raw as Record<string, unknown>;
      const token = cleanToken(record.key as string | undefined);
      if (!token) continue;
      const expires = expiryMs(record.expires_at ?? record.expiresAt);
      if (expires !== null && expires - now <= 60_000) continue;
      return {
        token,
        email: typeof record.email === "string" ? record.email : undefined,
        authMode: typeof record.auth_mode === "string" ? record.auth_mode : undefined,
        principalType: typeof record.principal_type === "string" ? record.principal_type : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Preference → GROK_OAUTH_TOKEN → ~/.grok/auth.json. */
export async function resolveGrokCredential(preferenceToken?: string): Promise<GrokCredential | null> {
  const preference = cleanToken(preferenceToken);
  if (preference) return { token: preference };
  const env = cleanToken(process.env.GROK_OAUTH_TOKEN);
  if (env) return { token: env };
  return readGrokAuthFile();
}

function mapHttpError(error: HttpFetchError, principalType?: string): GrokError {
  const teamNote =
    principalType === "team" ? " Team-principal usage is not exposed by Grok — only personal accounts report credits." : "";
  if (error.status === 403 || error.type === "unauthorized") {
    return { type: "unauthorized", message: `Grok token expired or rejected. Run \`grok login\` again.${teamNote}` };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  return { type: "unknown", message: `${error.message}${teamNote}` };
}

const billingHeaders = {
  Accept: "application/json",
  "x-xai-token-auth": "xai-grok-cli",
};

export async function fetchGrokUsage(
  credential: GrokCredential,
  urls: { billingUrl?: string; settingsUrl?: string } = {},
): Promise<{ usage: GrokUsage | null; error: GrokError | null }> {
  const { data, error } = await httpFetch({
    url: urls.billingUrl ?? GROK_BILLING_API,
    token: credential.token,
    headers: billingHeaders,
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "Grok token expired or rejected.",
  });
  if (error) return { usage: null, error: mapHttpError(error, credential.principalType) };

  const usage = parseGrokCredits(data);
  if (!usage) {
    return { usage: null, error: { type: "parse_error", message: "Grok returned no billing data." } };
  }

  // Plan tier is optional enrichment — a failed settings call must not drop usage.
  const identity = credential.email ?? null;
  const settings = await httpFetch({
    url: urls.settingsUrl ?? GROK_SETTINGS_API,
    token: credential.token,
    headers: billingHeaders,
    timeoutMs: SETTINGS_TIMEOUT,
    unauthorizedMessage: "",
  });
  const plan = settings.error ? null : parseGrokSettingsTier(settings.data);

  return { usage: { ...usage, plan: plan ?? credential.authMode ?? null, identity }, error: null };
}
