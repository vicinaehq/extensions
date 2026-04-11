import { getPreferenceValues } from "@vicinae/api";
import { useState } from "react";

interface Preferences {
  useStream: boolean;
  titleModel: string;
  titlePrompt: string;
}

/**
 * Returns all extension preferences as a stable object (read once on mount).
 * Replaces the individual useAutoTTS, useAutoSaveConversation hooks
 * and inline getPreferenceValues calls for useStream.
 */
export function usePreferences(): Preferences {
  const [prefs] = useState<Preferences>(() => {
    return getPreferenceValues<Preferences>();
  });
  return prefs;
}
