import { getPreferenceValues } from "@vicinae/api";
import { Preferences } from "./types";
import { useMemo } from "react";

let prefsCache: Preferences | null = null;

export function getPreferences() {
  if (!prefsCache) {
    prefsCache = getPreferenceValues<Preferences>();
  }
  return prefsCache;
}

export function useCheckPreferences() {
  useMemo(() => {
    getPreferences();
  }, []);
}
