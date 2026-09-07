import { getPreferenceValues } from "@vicinae/api";
import { Preferences } from "./types";

export function prefs(): Preferences {
  return getPreferenceValues<Preferences>();
}
