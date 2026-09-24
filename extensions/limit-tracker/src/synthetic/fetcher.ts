import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import { parseSyntheticQuotas } from "./parser.ts";
import type { SyntheticError, SyntheticUsage } from "./types.ts";

const SYNTHETIC_QUOTAS_API = "https://api.synthetic.new/v2/quotas";
const REQUEST_TIMEOUT = 15000;

export async function resolveSyntheticApiKey(preferenceKey?: string): Promise<string | null> {
  const fromPreference = preferenceKey?.trim();
  if (fromPreference) return fromPreference;
  const fromEnv = process.env.SYNTHETIC_API_KEY?.trim();
  return fromEnv || null;
}

function mapHttpError(error: HttpFetchError): SyntheticError {
  if (error.status === 403) {
    return { type: "forbidden", message: "Synthetic rejected the API key (HTTP 403). Create a key at dev.synthetic.new." };
  }
  if (error.type === "unauthorized") {
    return { type: "unauthorized", message: "Synthetic API key expired or invalid. Update it in extension settings." };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  return { type: "unknown", message: error.message };
}

export async function fetchSyntheticUsage(
  apiKey: string,
  url: string = SYNTHETIC_QUOTAS_API,
): Promise<{ usage: SyntheticUsage | null; error: SyntheticError | null }> {
  const { data, error } = await httpFetch({
    url,
    token: apiKey,
    headers: { Accept: "application/json" },
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "Synthetic API key expired or invalid.",
  });
  if (error) return { usage: null, error: mapHttpError(error) };

  const usage = parseSyntheticQuotas(data);
  if (!usage) {
    return { usage: null, error: { type: "parse_error", message: "Failed to parse Synthetic quotas — the API response shape may have changed." } };
  }
  return { usage, error: null };
}
