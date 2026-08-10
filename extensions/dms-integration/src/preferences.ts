import { getPreferenceValues } from "@vicinae/api";

/** Resolved DMS search backend port from extension preferences. */
export const dsearch_port: number = getPreferenceValues().dsearch_port ?? 43654;
