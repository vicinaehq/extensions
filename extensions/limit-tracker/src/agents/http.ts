export function normalizeBearerToken(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export interface HttpFetchOptions {
  url: string;
  method?: "GET" | "POST";
  token?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  unauthorizedMessage?: string;
}

export interface HttpFetchError {
  type: "unauthorized" | "network_error" | "unknown";
  message: string;
  /** HTTP status when the error came from a response (not a network failure). */
  status?: number;
}

export interface HttpFetchResult {
  data: unknown;
  error: HttpFetchError | null;
}

export async function httpFetch(options: HttpFetchOptions): Promise<HttpFetchResult> {
  const {
    url,
    method = "GET",
    token,
    headers = {},
    body,
    timeoutMs = 10000,
    unauthorizedMessage = "Authorization token expired or invalid. Please update it in extension settings.",
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const allHeaders: Record<string, string> = { ...headers };
  if (token) {
    allHeaders["Authorization"] = normalizeBearerToken(token);
  }

  const MAX_429_WAIT_MS = 4000;

  const retryAfterMs = (response: Response): number => {
    const raw = response.headers.get("Retry-After");
    const seconds = raw ? Number(raw) : NaN;
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_429_WAIT_MS) : 500;
  };

  try {
    // One bounded retry on 429 — enough to ride out a burst limit without
    // stalling the row behind a long Retry-After.
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { method, headers: allHeaders, body, signal: controller.signal });

      if (response.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response)));
        continue;
      }

      if (response.status === 401) {
        return { data: null, error: { type: "unauthorized", message: unauthorizedMessage, status: 401 } };
      }

      if (response.status === 429) {
        return {
          data: null,
          error: { type: "unknown", status: 429, message: "Rate limited (HTTP 429). Try again in a few minutes." },
        };
      }

      if (!response.ok) {
        return {
          data: null,
          error: { type: "unknown", status: response.status, message: `HTTP ${response.status}: ${response.statusText}` },
        };
      }

      const data = await response.json();
      return { data, error: null };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        data: null,
        error: { type: "network_error", message: "Request timeout. Please check your network connection." },
      };
    }
    return {
      data: null,
      error: { type: "network_error", message: err instanceof Error ? err.message : "Network request failed" },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
