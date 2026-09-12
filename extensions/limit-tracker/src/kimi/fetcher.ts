import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import { parseKimiUsage } from "./parser.ts";
import type { KimiError, KimiUsage } from "./types.ts";

const KIMI_USAGES_API = "https://api.kimi.com/coding/v1/usages";
const REQUEST_TIMEOUT = 15000;

function cleanToken(token: string | undefined): string | null {
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Fresh access token from the official Kimi Code CLI credential file
 * (~/.kimi-code/credentials/kimi-code.json). Read-only: the refresh token is
 * never used and the file is never rewritten. Expired tokens are skipped.
 */
export function readKimiCliToken(homeDir: string = os.homedir()): string | null {
  try {
    const credPath = path.join(homeDir, ".kimi-code", "credentials", "kimi-code.json");
    if (!fs.existsSync(credPath)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(credPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const token = cleanToken(
      (record.access_token ?? record.accessToken ?? record.token) as string | undefined,
    );
    if (!token) return null;
    const expires = record.expires_at ?? record.expiresAt;
    if (typeof expires === "number" && Number.isFinite(expires)) {
      const ms = expires > 1e12 ? expires : expires * 1000;
      if (ms - Date.now() <= 60_000) return null;
    } else if (typeof expires === "string") {
      const ms = Date.parse(expires);
      if (Number.isFinite(ms) && ms - Date.now() <= 60_000) return null;
    }
    return token;
  } catch {
    return null;
  }
}

/** Preference → KIMI_CODE_API_KEY → Kimi Code CLI credentials file. */
export async function resolveKimiToken(preferenceToken?: string): Promise<string | null> {
  const preference = cleanToken(preferenceToken);
  if (preference) return preference;
  const env = cleanToken(process.env.KIMI_CODE_API_KEY);
  if (env) return env;
  return readKimiCliToken();
}

function mapHttpError(error: HttpFetchError): KimiError {
  if (error.status === 403) {
    return { type: "forbidden", message: "Kimi Code rejected the credential (HTTP 403). Check the API key or re-login with the Kimi Code CLI." };
  }
  if (error.type === "unauthorized") {
    return { type: "unauthorized", message: "Kimi credential expired or invalid. Update the API key in settings or re-login with the Kimi Code CLI." };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  return { type: "unknown", message: error.message };
}

export async function fetchKimiUsage(
  token: string,
  url: string = KIMI_USAGES_API,
): Promise<{ usage: KimiUsage | null; error: KimiError | null }> {
  const { data, error } = await httpFetch({
    url,
    token,
    headers: { Accept: "application/json" },
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "Kimi credential expired or invalid.",
  });
  if (error) return { usage: null, error: mapHttpError(error) };

  const usage = parseKimiUsage(data);
  if (!usage) {
    return { usage: null, error: { type: "parse_error", message: "Failed to parse Kimi usage data — the API response shape may have changed." } };
  }
  return { usage, error: null };
}
