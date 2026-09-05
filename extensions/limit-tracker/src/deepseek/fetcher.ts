import { httpFetch } from "../agents/http.ts";
import type { DeepSeekError, DeepSeekUsage } from "./types.ts";

const DEEPSEEK_BALANCE_API = "https://api.deepseek.com/user/balance";
const DEEPSEEK_PLATFORM_API = "https://platform.deepseek.com/api/v0/users/get_user_summary";
const REQUEST_TIMEOUT = 15000;

interface DeepSeekBalanceInfoResponse {
  currency?: unknown;
  total_balance?: unknown;
  granted_balance?: unknown;
  topped_up_balance?: unknown;
}

interface DeepSeekBalanceResponse {
  is_available?: unknown;
  balance_infos?: unknown;
}

interface DeepSeekPlatformResponse {
  data?: {
    balance?: number;
    granted_balance?: number;
    topped_up_balance?: number;
    currency?: string;
  };
}

function parseBalance(info: DeepSeekBalanceInfoResponse): Omit<DeepSeekUsage, "isAvailable"> | null {
  if (
    typeof info.currency !== "string" ||
    typeof info.total_balance !== "string" ||
    typeof info.granted_balance !== "string" ||
    typeof info.topped_up_balance !== "string"
  ) {
    return null;
  }

  const totalBalance = Number(info.total_balance);
  const grantedBalance = Number(info.granted_balance);
  const toppedUpBalance = Number(info.topped_up_balance);
  if (!Number.isFinite(totalBalance) || !Number.isFinite(grantedBalance) || !Number.isFinite(toppedUpBalance)) {
    return null;
  }

  return {
    currency: info.currency,
    totalBalance,
    grantedBalance,
    toppedUpBalance,
  };
}

export function parseDeepSeekBalance(data: unknown): { usage: DeepSeekUsage | null; error: DeepSeekError | null } {
  if (!data || typeof data !== "object") {
    return { usage: null, error: { type: "parse_error", message: "Invalid DeepSeek API response format" } };
  }

  const response = data as DeepSeekBalanceResponse;
  if (typeof response.is_available !== "boolean" || !Array.isArray(response.balance_infos)) {
    return { usage: null, error: { type: "parse_error", message: "Missing DeepSeek balance data" } };
  }

  const balances = response.balance_infos.map((info) => parseBalance(info as DeepSeekBalanceInfoResponse));
  if (balances.some((balance) => balance === null)) {
    return { usage: null, error: { type: "parse_error", message: "Invalid numeric value in DeepSeek balance data" } };
  }

  const validBalances = balances.filter((balance): balance is NonNullable<typeof balance> => balance !== null);
  const selected = validBalances.find((balance) => balance.currency === "USD" && balance.totalBalance > 0) ??
    validBalances.find((balance) => balance.totalBalance > 0) ??
    validBalances.find((balance) => balance.currency === "USD") ??
    validBalances[0] ?? {
      currency: "USD",
      totalBalance: 0,
      grantedBalance: 0,
      toppedUpBalance: 0,
    };

  return {
    usage: { isAvailable: response.is_available, ...selected },
    error: null,
  };
}

/**
 * Fetch DeepSeek usage via API key (primary method)
 */
export async function fetchDeepSeekUsage(
  apiKey: string,
): Promise<{ usage: DeepSeekUsage | null; error: DeepSeekError | null }> {
  const { data, error } = await httpFetch({
    url: DEEPSEEK_BALANCE_API,
    token: apiKey,
    headers: { Accept: "application/json" },
    unauthorizedMessage: "DeepSeek API key expired or invalid. Please update it in extension settings.",
  });
  if (error) return { usage: null, error };
  return parseDeepSeekBalance(data);
}

/**
 * Fetch DeepSeek usage via platform session token (fallback method)
 * This uses the private platform API which requires a user session
 */
export async function fetchDeepSeekUsageWithSession(
  sessionToken: string,
): Promise<{ usage: DeepSeekUsage | null; error: DeepSeekError | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(DEEPSEEK_PLATFORM_API, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionToken.trim()}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      return {
        usage: null,
        error: {
          type: "unauthorized",
          message: "DeepSeek session expired. Please sign in again or use an API key.",
        },
      };
    }

    if (!response.ok) {
      return {
        usage: null,
        error: {
          type: "unknown",
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }

    const data = (await response.json()) as DeepSeekPlatformResponse;

    if (!data.data) {
      return {
        usage: null,
        error: { type: "parse_error", message: "Invalid DeepSeek platform response" },
      };
    }

    const usage: DeepSeekUsage = {
      isAvailable: true,
      currency: data.data.currency || "USD",
      totalBalance: data.data.balance || 0,
      grantedBalance: data.data.granted_balance || 0,
      toppedUpBalance: data.data.topped_up_balance || 0,
    };

    return { usage, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        usage: null,
        error: { type: "network_error", message: "Request timeout. Please check your network connection." },
      };
    }
    return {
      usage: null,
      error: {
        type: "network_error",
        message: err instanceof Error ? err.message : "Network request failed",
      },
    };
  }
}
