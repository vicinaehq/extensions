export interface AihubmixUsage {
  /** Remaining balance in USD, when the API reports a dollar amount. */
  balanceUsd: number | null;
  /** Raw remaining quota units ($1 = 500,000 quota). */
  quota: number | null;
  /** Granted total, when reported. */
  grantedUsd: number | null;
  usedUsd: number | null;
}

export interface AihubmixError {
  type: "not_configured" | "unauthorized" | "network_error" | "parse_error" | "unknown";
  message: string;
}
