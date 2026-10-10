export interface OpencodegoQuota {
  label: string;
  used: number;
  limit: number;
  unit: string;
  resetsAt?: string | null;
}

export interface OpencodegoUsage {
  planName: string;
  primary: OpencodegoQuota;
  quotas: OpencodegoQuota[];
  resetsAt: string | null;
  /** True when the API key came from the omp harness fallback. */
  viaOmp?: boolean;
}

export interface OpencodegoError {
  type: "not_configured" | "unauthorized" | "network_error" | "parse_error" | "unknown";
  message: string;
}
