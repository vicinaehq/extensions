import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import {
  buildDevinUsage,
  parseDevinAcuLimits,
  parseDevinCycles,
  parseDevinDailyConsumption,
  parseDevinWebQuota,
  pickCurrentCycle,
} from "./parser.ts";
import type { DevinError, DevinUsage, DevinWebQuota } from "./types.ts";

const DEVIN_API_BASE = "https://api.devin.ai";
const DEVIN_CYCLES_API = `${DEVIN_API_BASE}/v3/enterprise/consumption/cycles?first=200`;
const DEVIN_ACU_LIMITS_API = `${DEVIN_API_BASE}/v3/enterprise/consumption/acu-limits/devin?first=200`;
const DEVIN_DAILY_API = `${DEVIN_API_BASE}/v3/enterprise/consumption/daily`;
const REQUEST_TIMEOUT = 15000;

const FORBIDDEN_MESSAGE =
  "Devin consumption API requires an Enterprise plan and a cog_ service-user key with ViewAccountConsumption / ManageBilling permissions.";

export async function resolveDevinApiKey(preferenceKey?: string): Promise<string | null> {
  const fromPreference = preferenceKey?.trim();
  if (fromPreference) return fromPreference;
  const fromEnv = process.env.DEVIN_API_KEY?.trim();
  return fromEnv || null;
}

export interface DevinSession {
  /** Bearer session token from app.devin.ai (self-serve path). */
  token: string;
  /** Org slug, `org_...` id, or org URL. */
  organization: string;
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOrg(raw: string): string | null {
  let value = raw.trim().replace(/\/+$/, "");
  // Accept full org URLs: https://app.devin.ai/org/<slug>/... → org/<slug>
  try {
    const url = new URL(value);
    if (url.hostname === "devin.ai" || url.hostname.endsWith(".devin.ai")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && (parts[0] === "org" || parts[0] === "organizations")) {
        value = `${parts[0]}/${parts[1]}`;
      }
    }
  } catch {
    // Not a URL — keep the raw value.
  }
  if (value.startsWith("org/") || value.startsWith("organizations/")) return value;
  if (value.startsWith("org_")) return `organizations/${value}`;
  return value || null;
}

/** Preference/env → { token, organization } for the self-serve quota path. */
export function resolveDevinSession(preferenceToken?: string, preferenceOrg?: string): DevinSession | null {
  const token =
    clean(preferenceToken) ?? clean(process.env.DEVIN_BEARER_TOKEN) ?? clean(process.env.DEVIN_AUTHORIZATION);
  const org = clean(preferenceOrg) ?? clean(process.env.DEVIN_ORGANIZATION) ?? clean(process.env.DEVIN_ORG);
  if (!token || !org) return null;
  const normalized = normalizeOrg(org);
  if (!normalized) return null;
  let bare = token;
  if (bare.toLowerCase().startsWith("authorization:")) bare = bare.slice(bare.indexOf(":") + 1).trim();
  if (bare.toLowerCase().startsWith("bearer ")) bare = bare.slice(7).trim();
  return bare ? { token: bare, organization: normalized } : null;
}

/**
 * Self-serve quota path (any Devin plan): app.devin.ai/api/<org>/billing/quota/usage
 * reports daily + weekly usage percentages with reset timestamps. Tries the
 * documented org path shapes in order.
 */
export async function fetchDevinWebQuota(
  session: DevinSession,
  apiBase: string = "https://app.devin.ai",
): Promise<{ quota: DevinWebQuota | null; error: DevinError | null }> {
  const internalId = session.organization.startsWith("organizations/")
    ? session.organization.slice("organizations/".length)
    : null;
  const slug = session.organization.startsWith("org/") ? session.organization.slice(4) : session.organization;
  const paths = [
    ...(internalId ? [`${internalId}/billing/quota/usage`] : []),
    `${slug}/billing/quota/usage`,
    `org/${slug}/billing/quota/usage`,
    ...(internalId ? [`organizations/${internalId}/billing/quota/usage`] : []),
  ];

  let lastError: DevinError | null = null;
  for (const path of paths) {
    const { data, error } = await httpFetch({
      url: `${apiBase}/api/${path}`,
      token: session.token,
      headers: {
        Accept: "application/json",
        ...(internalId ? { "x-cog-org-id": internalId } : {}),
      },
      timeoutMs: REQUEST_TIMEOUT,
      unauthorizedMessage: "Devin session token is invalid or expired.",
    });
    if (error) {
      if (error.type === "unauthorized" || error.status === 403) {
        return { quota: null, error: { type: "unauthorized", message: "Devin session token is invalid or expired." } };
      }
      if (error.status === 404) {
        lastError = { type: "unknown", message: "Devin quota endpoint not found for this organization." };
        continue;
      }
      return { quota: null, error: mapHttpError(error) };
    }
    const quota = parseDevinWebQuota(data);
    if (quota) return { quota, error: null };
    lastError = { type: "parse_error", message: "Devin quota endpoint returned no daily/weekly windows." };
  }
  return { quota: null, error: lastError };
}

function mapHttpError(error: HttpFetchError): DevinError {
  if (error.status === 403) return { type: "forbidden", message: FORBIDDEN_MESSAGE };
  if (error.type === "unauthorized") {
    return { type: "unauthorized", message: "Devin service user key expired or invalid. Update it in extension settings." };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  return { type: "unknown", message: error.message };
}

/**
 * Devin v3 consumption flow: billing cycles locate the current window, daily
 * consumption fills it in, and the acu-limits endpoint provides the caps.
 * All three are Enterprise-plan endpoints — a 403 is surfaced as `forbidden`,
 * not mistaken for an expired key.
 */
export async function fetchDevinUsage(
  apiKey: string,
  session?: DevinSession | null,
): Promise<{ usage: DevinUsage | null; error: DevinError | null }> {
  const [webRes, cyclesRes, limitsRes] = await Promise.all([
    session ? fetchDevinWebQuota(session) : Promise.resolve({ quota: null, error: null }),
    httpFetch({ url: DEVIN_CYCLES_API, token: apiKey, headers: { Accept: "application/json" }, timeoutMs: REQUEST_TIMEOUT }),
    httpFetch({ url: DEVIN_ACU_LIMITS_API, token: apiKey, headers: { Accept: "application/json" }, timeoutMs: REQUEST_TIMEOUT }),
  ]);

  const cycles = cyclesRes.error ? [] : parseDevinCycles(cyclesRes.data);
  const current = pickCurrentCycle(cycles, Date.now());
  const nowMs = Date.now();

  // Enterprise path failed but the web quota worked — still show the card.
  if ((cyclesRes.error || limitsRes.error) && webRes.quota) {
    return {
      usage: {
        cycleStartMs: current?.afterMs ?? 0,
        cycleEndMs: current?.beforeMs ?? 0,
        limits: limitsRes.error ? [] : parseDevinAcuLimits(limitsRes.data),
        totalAcus: 0,
        devinAcus: 0,
        byProduct: { devin: 0, cascade: 0, terminal: 0, review: 0 },
        web: webRes.quota,
      },
      error: null,
    };
  }

  if (cyclesRes.error) return { usage: null, error: mapHttpError(cyclesRes.error) };
  if (limitsRes.error) return { usage: null, error: mapHttpError(limitsRes.error) };

  if (!current) {
    return {
      usage: null,
      error: { type: "parse_error", message: "Devin returned no billing cycles." },
    };
  }

  const dailyRes = await httpFetch({
    url: `${DEVIN_DAILY_API}?time_after=${Math.floor(current.afterMs / 1000)}&time_before=${Math.floor(nowMs / 1000)}`,
    token: apiKey,
    headers: { Accept: "application/json" },
    timeoutMs: REQUEST_TIMEOUT,
  });
  if (dailyRes.error && !webRes.quota) return { usage: null, error: mapHttpError(dailyRes.error) };

  const usage = buildDevinUsage({
    limits: parseDevinAcuLimits(limitsRes.data),
    cycles,
    daily: dailyRes.error ? null : parseDevinDailyConsumption(dailyRes.data),
    nowMs,
    web: webRes.quota,
  });
  if (!usage) {
    return { usage: null, error: { type: "parse_error", message: "Devin returned no billing cycles." } };
  }
  return { usage, error: null };
}

/**
 * Web-only path for self-serve plans: no cog_ key needed, just the
 * app.devin.ai session + organization. Surfaces daily/weekly quotas as a
 * DevinUsage with no enterprise fields.
 */
export async function fetchDevinWebOnly(
  session: DevinSession,
  apiBase?: string,
): Promise<{ usage: DevinUsage | null; error: DevinError | null }> {
  const { quota, error } = await fetchDevinWebQuota(session, apiBase);
  if (error) return { usage: null, error };
  if (!quota) return { usage: null, error: { type: "parse_error", message: "Devin quota endpoint returned no daily/weekly windows." } };
  return {
    usage: {
      cycleStartMs: 0,
      cycleEndMs: 0,
      limits: [],
      totalAcus: 0,
      devinAcus: 0,
      byProduct: { devin: 0, cascade: 0, terminal: 0, review: 0 },
      web: quota,
    },
    error: null,
  };
}
