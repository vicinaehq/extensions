import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import { parseClinepassUsageLimits } from "./parser.ts";
import type { ClinepassError, ClinepassUsage } from "./types.ts";

const CLINEPASS_API = "https://api.cline.bot/api/v1/users/me/plan/usage-limits";
const REQUEST_TIMEOUT = 15000;

export async function resolveClinepassApiKey(preferenceKey?: string): Promise<string | null> {
  const fromPreference = preferenceKey?.trim();
  if (fromPreference) return fromPreference;
  const fromEnv = process.env.CLINEPASS_API_KEY?.trim() || process.env.CLINE_API_KEY?.trim();
  return fromEnv || null;
}

function mapHttpError(error: HttpFetchError): ClinepassError {
  if (error.status === 403 || error.type === "unauthorized") {
    return { type: "unauthorized", message: "ClinePass API key was rejected. Create a key in the Cline app and update it in extension settings." };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  if (error.status !== undefined && error.status >= 500) {
    return { type: "unknown", message: `ClinePass API unavailable (HTTP ${error.status}). Try again later.` };
  }
  return { type: "unknown", message: error.message };
}

export async function fetchClinepassUsage(
  apiKey: string,
  url: string = CLINEPASS_API,
): Promise<{ usage: ClinepassUsage | null; error: ClinepassError | null }> {
  const { data, error } = await httpFetch({
    url,
    token: apiKey,
    headers: { Accept: "application/json" },
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "ClinePass API key was rejected.",
  });
  if (error) return { usage: null, error: mapHttpError(error) };

  const parsed = parseClinepassUsageLimits(data);
  if (parsed === null || typeof parsed === "string") {
    const detail =
      parsed === "unsuccessful"
        ? "the API reported success=false"
        : parsed === "bad_limits"
          ? "data.limits is missing"
          : "unexpected response shape";
    return { usage: null, error: { type: "parse_error", message: `Failed to parse ClinePass response: ${detail}.` } };
  }
  return { usage: parsed, error: null };
}
