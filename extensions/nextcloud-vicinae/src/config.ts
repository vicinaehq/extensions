import { environment } from "@vicinae/api";
import { getPreferences } from "./preferences";

let baseUrlCache: string | null = null;
let apiHeadersCache: Record<string, string> | null = null;

export function getBaseUrl(): string {
  if (baseUrlCache) return baseUrlCache;
  const { hostname } = getPreferences();
  const cleanHost = hostname.endsWith("/") ? hostname.slice(0, -1) : hostname;
  baseUrlCache = cleanHost.startsWith("http") ? cleanHost : `https://${cleanHost}`;
  return baseUrlCache;
}

export function getApiHeaders() {
  if (apiHeadersCache) return apiHeadersCache;
  const { username, app_password } = getPreferences();
  const raycastVersion = (environment as any).raycastVersion || "1.0.0";
  const vicinaeVersion = (environment as any).vicinaeVersion || "1.0.0";

  apiHeadersCache = {
    Authorization: "Basic " + Buffer.from(username + ":" + app_password).toString("base64"),
    "User-Agent": `Vicinae/${vicinaeVersion} (Raycast/${raycastVersion})`,
  };
  return apiHeadersCache;
}
