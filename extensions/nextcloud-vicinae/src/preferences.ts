import { getPreferenceValues } from "@vicinae/api";
import { Preferences } from "./types";

let prefsCache: Preferences | null = null;

export function getPreferences() {
  if (!prefsCache) {
    prefsCache = getPreferenceValues<Preferences>();
  }
  return prefsCache;
}
