import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import { parseAihubmixRemain, parseAihubmixSelf } from "./parser.ts";
import type { AihubmixError, AihubmixUsage } from "./types.ts";

const AIHUBMIX_REMAIN_API = "https://aihubmix.com/dashboard/billing/remain";
const AIHUBMIX_SELF_API = "https://aihubmix.com/api/user/self";
const REQUEST_TIMEOUT = 15000;

export async function resolveAihubmixApiKey(preferenceKey?: string): Promise<string | null> {
  const fromPreference = preferenceKey?.trim();
  if (fromPreference) return fromPreference;
  const fromEnv = process.env.AIHUBMIX_API_KEY?.trim();
  return fromEnv || null;
}

function mapHttpError(error: HttpFetchError): AihubmixError {
  if (error.type === "unauthorized" || error.status === 403) {
    return { type: "unauthorized", message: "AiHubMix key rejected. Update it in extension settings or set AIHUBMIX_API_KEY." };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  return { type: "unknown", message: error.message };
}

export async function fetchAihubmixUsage(
  apiKey: string,
  urls: { remainUrl?: string; selfUrl?: string } = {},
): Promise<{ usage: AihubmixUsage | null; error: AihubmixError | null }> {
  // Per-key remaining quota first; the account-level endpoint as fallback.
  const remainRes = await httpFetch({
    url: urls.remainUrl ?? AIHUBMIX_REMAIN_API,
    token: apiKey,
    headers: { Accept: "application/json" },
    timeoutMs: REQUEST_TIMEOUT,
    unauthorizedMessage: "AiHubMix key rejected.",
  });
  if (remainRes.data) {
    const usage = parseAihubmixRemain(remainRes.data);
    if (usage) return { usage, error: null };
  } else if (remainRes.error?.type === "unauthorized" || remainRes.error?.status === 403) {
    return { usage: null, error: mapHttpError(remainRes.error) };
  }

  const selfRes = await httpFetch({
    url: urls.selfUrl ?? AIHUBMIX_SELF_API,
    headers: { Accept: "application/json", Authorization: apiKey },
    timeoutMs: REQUEST_TIMEOUT,
  });
  if (selfRes.data) {
    const usage = parseAihubmixSelf(selfRes.data);
    if (usage) return { usage, error: null };
  }

  if (remainRes.error) return { usage: null, error: mapHttpError(remainRes.error) };
  if (selfRes.error) return { usage: null, error: mapHttpError(selfRes.error) };
  return { usage: null, error: { type: "parse_error", message: "AiHubMix returned no recognizable balance fields." } };
}
