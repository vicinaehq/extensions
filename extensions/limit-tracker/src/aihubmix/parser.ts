import type { AihubmixUsage } from "./types.ts";

/**
 * Pure parser for AiHubMix (new-api lineage) billing endpoints:
 *   GET https://aihubmix.com/dashboard/billing/remain   (Bearer sk- key)
 *   GET https://aihubmix.com/api/user/self              (account access token)
 * Shapes vary across deployments, so extraction is defensive: the first numeric
 * hit among common remain/balance keys wins. $1 == 500,000 quota units.
 */

const QUOTA_PER_USD = 500000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNum(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function firstNum(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const n = asNum(record[key]);
    if (n !== undefined) return n;
  }
  return undefined;
}

/** Remain/billing payload → usage. Looks at root then `data`. */
export function parseAihubmixRemain(data: unknown): AihubmixUsage | null {
  const root = asRecord(data);
  if (!root) return null;
  const scope = asRecord(root.data) ?? root;

  const remain = firstNum(scope, ["remain", "remaining", "total_available", "balance", "credit", "quota"]);
  const granted = firstNum(scope, ["total_granted", "granted", "total_grant_amount", "quota_total"]);
  const used = firstNum(scope, ["total_used", "used", "used_quota", "total_used_quota"]);

  if (remain === undefined && granted === undefined && used === undefined) return null;

  // Large values are quota units; small values are already USD.
  const toUsd = (v: number | undefined) => (v === undefined ? null : v >= 10000 ? v / QUOTA_PER_USD : v);
  return {
    balanceUsd: toUsd(remain),
    quota: remain !== undefined && remain >= 10000 ? remain : null,
    grantedUsd: toUsd(granted),
    usedUsd: toUsd(used),
  };
}

/** /api/user/self payload → usage (quota lives under data.quota). */
export function parseAihubmixSelf(data: unknown): AihubmixUsage | null {
  const root = asRecord(data);
  if (!root) return null;
  const user = asRecord(root.data);
  const quota = asNum(user?.quota ?? root.quota);
  if (quota === undefined) return null;
  return { balanceUsd: quota / QUOTA_PER_USD, quota, grantedUsd: null, usedUsd: null };
}
