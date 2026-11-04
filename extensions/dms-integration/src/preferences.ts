import { getPreferenceValues } from "@vicinae/api";

/** Resolved Dux Shell search backend port from extension preferences. */
export const dsearch_port: number = getPreferenceValues().dsearch_port ?? 43654;
