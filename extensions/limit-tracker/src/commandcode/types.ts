export interface CommandcodeUsage {
  plan?: string;
  /** Percent of credits used, 0..100, when computable. */
  percentUsed?: number;
  creditsTotal?: number;
  creditsUsed?: number;
  /** Days remaining in the billing period, when reported. */
  daysRemaining?: number | null;
  /** Epoch milliseconds of renewal, when parseable (drives the live countdown). */
  renewsAtMs?: number | null;
}

export interface CommandcodeError {
  type: "not_configured" | "unauthorized" | "network_error" | "parse_error" | "unknown";
  message: string;
}
