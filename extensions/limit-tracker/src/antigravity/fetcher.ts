import { readOmpUsageSnapshots, type OmpUsageSnapshot } from "../omp/store.ts";
import type { AntigravityError, AntigravityPool, AntigravityUsage } from "./types.ts";

const OMP_PROVIDER_ID = "google-antigravity";

/**
 * Map harness snapshots to Antigravity pools. Pure function (tested).
 * percentRemaining derives from the snapshot's used fraction, clamped 0..100.
 */
export function mapSnapshotsToAntigravityUsage(rows: OmpUsageSnapshot[]): AntigravityUsage {
  const pools: AntigravityPool[] = rows.map((row) => ({
    id: row.limitId,
    label: row.label,
    windowLabel: row.windowLabel,
    percentRemaining: Math.round((1 - row.usedFraction) * 100),
    status: row.status,
    resetsAtMs: row.resetsAtMs,
  }));
  return { pools, viaOmp: true };
}

/**
 * Fetch Antigravity quota from oh-my-pi harness snapshots.
 * There is no direct provider API in v1: values come from omp's local
 * `usage_history` records, so they are labeled as snapshots (see renderer)
 * and reset times are omitted when omp records none.
 */
export async function fetchAntigravityUsage(agentDir?: string, enabled = true): Promise<{
  usage: AntigravityUsage | null;
  error: AntigravityError | null;
}> {
  let rows: OmpUsageSnapshot[] | null;
  try {
    rows = await readOmpUsageSnapshots(OMP_PROVIDER_ID, agentDir, enabled);
  } catch {
    rows = null;
  }
  if (!rows || rows.length === 0) {
    return {
      usage: null,
      error: {
        type: "not_configured",
        message: "No Antigravity usage recorded. Log in via `omp auth-broker login google-antigravity` and run a session.",
      },
    };
  }
  return { usage: mapSnapshotsToAntigravityUsage(rows), error: null };
}
