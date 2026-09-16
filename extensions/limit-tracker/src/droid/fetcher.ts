import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import { parseFactoryBillingLimits, parseFactorySubscriptionUsage } from "./parser.ts";
import type { DroidError, DroidUsage } from "./types.ts";

const FACTORY_BILLING_LIMITS_API = "https://api.factory.ai/api/billing/limits";
const FACTORY_SUBSCRIPTION_USAGE_API = "https://app.factory.ai/api/organization/subscription/usage?useCache=true";
const REQUEST_TIMEOUT = 15000;

const FACTORY_HEADERS = {
  Accept: "application/json",
  Origin: "https://app.factory.ai",
  Referer: "https://app.factory.ai/",
  "x-factory-client": "web-app",
};

function cleanToken(token: string | undefined): string | null {
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

/** Read FACTORY_API_KEY from ~/.factory/.env (KEY=value or export KEY=value). */
export function readFactoryEnvFile(homeDir: string = os.homedir()): string | null {
  try {
    const envPath = path.join(homeDir, ".factory", ".env");
    if (!fs.existsSync(envPath)) return null;
    const text = fs.readFileSync(envPath, "utf-8");
    const match = /^\s*(?:export\s+)?FACTORY_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m.exec(text);
    return cleanToken(match?.[1]);
  } catch {
    return null;
  }
}

/** Preference → FACTORY_API_KEY → ~/.factory/.env. */
export async function resolveFactoryApiKey(preferenceKey?: string): Promise<string | null> {
  const preference = cleanToken(preferenceKey);
  if (preference) return preference;
  const env = cleanToken(process.env.FACTORY_API_KEY);
  if (env) return env;
  return readFactoryEnvFile();
}

function mapHttpError(error: HttpFetchError): DroidError {
  if (error.status === 403 || error.type === "unauthorized") {
    return { type: "unauthorized", message: "Factory API key rejected. Regenerate it at app.factory.ai/settings/api-keys." };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  return { type: "unknown", message: error.message };
}

export async function fetchDroidUsage(
  apiKey: string,
  urls: { limitsUrl?: string; usageUrl?: string } = {},
): Promise<{ usage: DroidUsage | null; error: DroidError | null }> {
  const nowMs = Date.now();
  const limitsRes = await httpFetch({
    url: urls.limitsUrl ?? FACTORY_BILLING_LIMITS_API,
    token: apiKey,
    headers: FACTORY_HEADERS,
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "Factory API key rejected.",
  });
  if (limitsRes.error) return { usage: null, error: mapHttpError(limitsRes.error) };

  const rateLimits = parseFactoryBillingLimits(limitsRes.data, nowMs);
  if (rateLimits) return { usage: rateLimits, error: null };

  // Legacy Standard/Premium billing accounts answer on a different endpoint.
  const usageRes = await httpFetch({
    url: urls.usageUrl ?? FACTORY_SUBSCRIPTION_USAGE_API,
    token: apiKey,
    headers: FACTORY_HEADERS,
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "Factory API key rejected.",
  });
  if (usageRes.error) return { usage: null, error: mapHttpError(usageRes.error) };
  const legacy = parseFactorySubscriptionUsage(usageRes.data);
  if (!legacy) {
    return { usage: null, error: { type: "parse_error", message: "Factory returned no recognizable usage windows." } };
  }
  return { usage: legacy, error: null };
}
