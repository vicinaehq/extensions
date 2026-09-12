export type DevinLimitScope = "enterprise" | "org" | "user";

export interface DevinAcuLimit {
  scope: DevinLimitScope;
  orgId: string | null;
  userId: string | null;
  /** ACUs allowed per billing cycle at this scope. */
  cycleAcuLimit: number;
}

export interface DevinProductAcus {
  devin: number;
  cascade: number;
  terminal: number;
  review: number;
}

/** Self-serve quota from app.devin.ai/api/<org>/billing/quota/usage. */
export interface DevinWebQuota {
  dailyUsedPct: number | null;
  dailyResetMs: number | null;
  weeklyUsedPct: number | null;
  weeklyResetMs: number | null;
  plan: string | null;
  overageBalanceUsd: number | null;
}

export interface DevinUsage {
  /** Current billing cycle bounds, epoch ms (Enterprise path). */
  cycleStartMs: number;
  cycleEndMs: number;
  /** Org-level Devin ACU limits for the enterprise (any scope). */
  limits: DevinAcuLimit[];
  /** ACUs consumed this cycle, enterprise-wide, all products. */
  totalAcus: number;
  /** Cycle consumption attributed to the Devin product. */
  devinAcus: number;
  byProduct: DevinProductAcus;
  /** Self-serve daily/weekly quotas (web path) — present for any plan. */
  web: DevinWebQuota | null;
}

export interface DevinError {
  type: "not_configured" | "unauthorized" | "forbidden" | "network_error" | "parse_error" | "unknown";
  message: string;
}
