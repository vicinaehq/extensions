import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import { parseMinimaxRemains } from "./parser.ts";
import type { MinimaxError, MinimaxRegion, MinimaxUsage } from "./types.ts";

const API_BASE: Record<MinimaxRegion, string> = {
  global: "https://api.minimax.io",
  cn: "https://api.minimaxi.com",
};
const REMAINS_PATHS = ["v1/token_plan/remains", "v1/api/openplatform/coding_plan/remains"];
const REQUEST_TIMEOUT = 15000;

function cleanToken(token: string | undefined): string | null {
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

/** Preference → MINIMAX_CODING_API_KEY → MINIMAX_API_KEY. */
export async function resolveMinimaxApiKey(preferenceKey?: string): Promise<string | null> {
  const preference = cleanToken(preferenceKey);
  if (preference) return preference;
  return cleanToken(process.env.MINIMAX_CODING_API_KEY) ?? cleanToken(process.env.MINIMAX_API_KEY);
}

/** Preference → MINIMAX_CN_API_KEY → MINIMAX_CODING_API_KEY. */
export async function resolveMinimaxcnApiKey(preferenceKey?: string): Promise<string | null> {
  const preference = cleanToken(preferenceKey);
  if (preference) return preference;
  return cleanToken(process.env.MINIMAX_CN_API_KEY) ?? cleanToken(process.env.MINIMAX_CODING_API_KEY);
}

function mapHttpError(error: HttpFetchError, region: MinimaxRegion): MinimaxError {
  if (error.status === 403 || error.type === "unauthorized") {
    const host = region === "cn" ? "platform.minimaxi.com" : "platform.minimax.io";
    return {
      type: "unauthorized",
      message: `MiniMax key rejected by the ${host} endpoint. Use a Coding Plan key (sk-cp-*) for the right region.`,
    };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  return { type: "unknown", message: error.message };
}

export async function fetchMinimaxUsage(
  apiKey: string,
  region: MinimaxRegion,
  baseOverride?: string,
): Promise<{ usage: MinimaxUsage | null; error: MinimaxError | null }> {
  const base = baseOverride ?? API_BASE[region];
  const headers = { Accept: "application/json", "MM-API-Source": "limit-tracker" };

  let lastError: MinimaxError | null = null;
  for (const path of REMAINS_PATHS) {
    const { data, error } = await httpFetch({
      url: `${base}/${path}`,
      token: apiKey,
      headers,
      timeoutMs: REQUEST_TIMEOUT,
      unauthorizedMessage: "MiniMax key rejected.",
    });
    if (error) {
      if (error.status === 404 || error.type === "network_error") {
        lastError = mapHttpError(error, region);
        continue;
      }
      return { usage: null, error: mapHttpError(error, region) };
    }
    const { usage, apiError } = parseMinimaxRemains(data);
    if (apiError) return { usage: null, error: { type: "unknown", message: `MiniMax API: ${apiError}` } };
    if (usage) return { usage, error: null };
    lastError = { type: "parse_error", message: "MiniMax returned no model remains." };
  }
  return { usage: null, error: lastError ?? { type: "parse_error", message: "MiniMax returned no model remains." } };
}
