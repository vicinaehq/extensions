import { closeMainWindow, popToRoot, getPreferenceValues } from "@vicinae/api";
import type { Preferences } from "../types/prefs";

export async function applyWindowAction(): Promise<void> {
  const prefs = getPreferenceValues<Preferences>();
  if (prefs.windowActionOnCopy === "close") {
    await popToRoot();
    await closeMainWindow();
  }
}
