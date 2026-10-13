export interface AntigravityPool {
  id: string;
  label: string;
  windowLabel: string;
  /** Percent remaining, 0..100. */
  percentRemaining: number;
  /** omp status passthrough: "ok" | "warning" | "exhausted" | ... */
  status: string;
  /** Epoch milliseconds, when omp records one. Null = unknown, never rendered. */
  resetsAtMs: number | null;
}

export interface AntigravityUsage {
  pools: AntigravityPool[];
  /** Always true: values are harness snapshots, not live API data. */
  viaOmp: true;
}

export interface AntigravityError {
  type: "not_configured" | "network_error" | "parse_error" | "unknown";
  message: string;
}
