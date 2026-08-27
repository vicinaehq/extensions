import { parseOpencodegoHtml } from "./parser.ts";
import type { OpencodegoQuota, OpencodegoUsage, OpencodegoError } from "./types.ts";

const OPENCODE_GO_USAGE_API = "https://opencode.ai/zen/go/v1/usage";
const REQUEST_TIMEOUT = 15000;

interface OpencodeGoApiResponse {
  plan?: string;
  usage?: {
    five_hour?: { used: number; limit: number; resets_at: string };
    weekly?: { used: number; limit: number; resets_at: string };
    monthly?: { used: number; limit: number; resets_at: string };
  };
  quotas?: Array<{
    label: string;
    used: number;
    limit: number;
    unit: string;
    resets_at?: string;
  }>;
}

/**
 * Fetch OpenCode Go usage via the public API using an API key.
 * This is the preferred method - much simpler than cookie-based auth.
 */
export async function fetchOpencodegoUsageWithApiKey(
  apiKey: string,
): Promise<{ usage: OpencodegoUsage | null; error: OpencodegoError | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(OPENCODE_GO_USAGE_API, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      return {
        usage: null,
        error: {
          type: "unauthorized",
          message: "OpenCode Go API key expired or invalid. Please update your API key in extension settings.",
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

    const data = (await response.json()) as unknown as Record<string, unknown>;
    const raw = data as OpencodeGoApiResponse & Record<string, unknown>;

    const asNum = (v: unknown): number | undefined => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
      return undefined;
    };
    const validQuota = (label: string, used: unknown, limit: unknown, unit = "requests"): OpencodegoQuota | null => {
      const u = asNum(used);
      const l = asNum(limit);
      if (u === undefined || l === undefined) return null;
      return { label, used: u, limit: l, unit };
    };
    // Helpers for Go percent shape (rolling/weekly/monthly with percent + resetsAt/resetInSec)
    const percentKeys = ["percent", "usagePercent", "usedPercent", "percentUsed", "usage_percent", "used_percent", "utilization", "utilizationPercent", "percent_used"];
    const resetSecKeys = ["resetInSec", "resetInSeconds", "resetsInSec", "resetSec", "reset_sec"];
    const resetAtKeys = ["resetsAt", "resetAt", "resets_at", "reset_at", "nextReset", "renewAt", "renewsAt"];
    const extractPercent = (entry: Record<string, unknown>): number | undefined => {
      for (const k of percentKeys) {
        const v = asNum(entry[k]);
        if (v !== undefined) return v;
      }
      // Try used/limit fallback -> percent = used/limit*100
      const used = entry.used ?? entry.consumed ?? entry.usage ?? entry.value;
      const limit = entry.limit ?? entry.quota ?? entry.total ?? entry.max;
      const u = asNum(used);
      const l = asNum(limit);
      if (u !== undefined && l !== undefined && l > 0) return (u / l) * 100;
      return undefined;
    };
    const extractReset = (entry: Record<string, unknown>): string | null => {
      for (const k of resetAtKeys) {
        const v = entry[k];
        if (typeof v === "string" && v.trim()) return v;
      }
      for (const k of resetSecKeys) {
        const v = asNum(entry[k]);
        if (v !== undefined) {
          const d = new Date(Date.now() + v * 1000);
          return d.toISOString();
        }
      }
      return null;
    };
    const toPercentQuota = (label: string, entry: Record<string, unknown> | undefined): { quota: OpencodegoQuota | null; resetsAt: string | null } => {
      if (!entry) return { quota: null, resetsAt: null };
      const p = extractPercent(entry);
      if (p === undefined) return { quota: null, resetsAt: extractReset(entry) };
      // Go reports percent used 0..100 direct (0.6 means 0.6%, not 60%) — keep as-is, clamp 0..100
      const used = Math.min(100, Math.max(0, p));
      return { quota: { label, used, limit: 100, unit: "%" }, resetsAt: extractReset(entry) };
    };

    const quotas: OpencodegoQuota[] = [];
    let rollingResetsAt: string | null = null;
    let weeklyResetsAt: string | null = null;
    let monthlyResetsAt: string | null = null;

    // Try Go shape first: usage.rolling / weekly / monthly with percent
    const usageObj = (raw.usage ?? raw) as Record<string, unknown>;
    const rollingRaw = (usageObj.rolling ?? usageObj.rollingUsage ?? usageObj["5h"] ?? (raw.usage as Record<string, unknown> | undefined)?.five_hour ?? (raw.usage as Record<string, unknown> | undefined)?.fiveHour) as Record<string, unknown> | undefined;
    const weeklyRaw = (usageObj.weekly ?? usageObj.weeklyUsage) as Record<string, unknown> | undefined;
    const monthlyRaw = (usageObj.monthly ?? usageObj.monthlyUsage) as Record<string, unknown> | undefined;

    const rolling = toPercentQuota("5-Hour", rollingRaw);
    const weekly = toPercentQuota("Weekly", weeklyRaw);
    const monthly = toPercentQuota("Monthly", monthlyRaw);
    if (rolling.quota) {
      quotas.push({ ...rolling.quota, resetsAt: rolling.resetsAt });
      rollingResetsAt = rolling.resetsAt;
    }
    if (weekly.quota) {
      quotas.push({ ...weekly.quota, resetsAt: weekly.resetsAt });
      weeklyResetsAt = weekly.resetsAt;
    }
    if (monthly.quota) {
      quotas.push({ ...monthly.quota, resetsAt: monthly.resetsAt });
      monthlyResetsAt = monthly.resetsAt;
    }

    // Fallback: try legacy used/limit shape if percent shape empty
    if (quotas.length === 0) {
      const addLegacy = (label: string, entry: Record<string, unknown> | undefined) => {
        if (!entry) return;
        const used = entry.used ?? entry.consumed ?? entry.usage;
        const limit = entry.limit ?? entry.quota ?? entry.total;
        const q = validQuota(label, used as unknown, limit as unknown, (entry.unit as string) || "requests");
        if (q) {
          const r = extractReset(entry);
          quotas.push(r ? { ...q, resetsAt: r } : q);
          if (label === "5-Hour") rollingResetsAt = r;
          if (label === "Weekly") weeklyResetsAt = r;
          if (label === "Monthly") monthlyResetsAt = r;
        }
      };
      addLegacy("5-Hour", (raw.usage as Record<string, unknown> | undefined)?.five_hour as Record<string, unknown>);
      addLegacy("Weekly", (raw.usage as Record<string, unknown> | undefined)?.weekly as Record<string, unknown>);
      addLegacy("Monthly", (raw.usage as Record<string, unknown> | undefined)?.monthly as Record<string, unknown>);
      for (const q of (raw.quotas as unknown as Record<string, unknown>[] | undefined) || []) {
        const label = String(q.label || q.name || "Quota");
        const vq = validQuota(label, q.used as unknown, q.limit as unknown, (q.unit as string) || "requests");
        if (vq) {
          const r = extractReset(q as Record<string, unknown>);
          quotas.push(r ? { ...vq, resetsAt: r } : vq);
        }
      }
    }

    if (quotas.length === 0) {
      return {
        usage: null,
        error: { type: "parse_error", message: "OpenCode Go response did not contain usable quota data." },
      };
    }
    let primary: OpencodegoQuota | null = null;
    const rQuota = rolling.quota ? { ...rolling.quota, resetsAt: rolling.resetsAt } : null;
    primary = rQuota ?? quotas[0];
    if (primary && !primary.resetsAt) {
      if (primary.label === "5-Hour") primary = { ...primary, resetsAt: rollingResetsAt };
      else if (primary.label === "Weekly") primary = { ...primary, resetsAt: weeklyResetsAt };
      else if (primary.label === "Monthly") primary = { ...primary, resetsAt: monthlyResetsAt };
    }
    if (primary && quotas.length > 0 && quotas[0].label === primary.label && quotas[0].used === primary.used) {
      quotas.shift();
    }
    if (!primary) primary = { label: "Primary", used: 0, limit: 100, unit: "%", resetsAt: null };

    const usage: OpencodegoUsage = {
      planName: (raw.plan as string) || (data as Record<string, unknown>).plan as string || "OpenCode Go",
      primary,
      quotas,
      resetsAt: rollingResetsAt || weeklyResetsAt || monthlyResetsAt || (data as Record<string, unknown>).resetsAt as string || null,
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

function buildWorkspaceUrl(workspaceId: string): string {
  const id = workspaceId.trim();
  const fullId = id.startsWith("wrk_") ? id : `wrk_${id}`;
  return `https://opencode.ai/workspace/${fullId}/go`;
}

/**
 * Fetch OpenCode Go usage via web scraping (legacy method).
 * Requires workspace ID and auth cookie.
 */
async function fetchOpencodegoPage(
  url: string,
  authCookie: string,
): Promise<{ html: string | null; error: OpencodegoError | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: `auth=${authCookie.trim()}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      return {
        html: null,
        error: {
          type: "unauthorized",
          message:
            "OpenCode Go session expired or invalid. Please update your auth cookie in extension settings (Cmd+,).",
        },
      };
    }

    if (response.redirected && response.url.includes("/login")) {
      return {
        html: null,
        error: {
          type: "unauthorized",
          message: "OpenCode Go session expired. Please update your auth cookie in extension settings (Cmd+,).",
        },
      };
    }

    if (!response.ok) {
      return {
        html: null,
        error: {
          type: "unknown",
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }

    const html = await response.text();
    return { html, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        html: null,
        error: { type: "network_error", message: "Request timeout. Please check your network connection." },
      };
    }
    return {
      html: null,
      error: {
        type: "network_error",
        message: err instanceof Error ? err.message : "Network request failed",
      },
    };
  }
}

/**
 * Fetch OpenCode Go usage via web scraping (legacy method).
 * @deprecated Use fetchOpencodegoUsageWithApiKey instead when possible.
 */
export async function fetchOpencodegoUsage(
  workspaceId: string,
  authCookie: string,
): Promise<{ usage: OpencodegoUsage | null; error: OpencodegoError | null }> {
  const url = buildWorkspaceUrl(workspaceId);
  const { html, error: fetchError } = await fetchOpencodegoPage(url, authCookie);

  if (fetchError) return { usage: null, error: fetchError };
  if (!html) return { usage: null, error: { type: "unknown", message: "No HTML response received" } };

  return parseOpencodegoHtml(html);
}
