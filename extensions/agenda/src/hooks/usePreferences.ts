import { getPreferenceValues } from "@vicinae/api";
import { Preferences } from "../lib/types";

export function usePreferences() {
  const preferences = getPreferenceValues<Preferences>();
  return {
    refreshInterval: parseInt(preferences.refreshInterval) || 15,
    use24Hour: preferences.timeFormat === "24h",
  };
}
