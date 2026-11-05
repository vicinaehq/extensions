import { getPreferenceValues } from "@vicinae/api";

export interface ExtensionPreferences {
  readonly serverUrl?: string;
  readonly serverUsername?: string;
  readonly serverPassword?: string;
  readonly openCodePath?: string;
}

export interface Config {
  readonly serverUrl?: string;
  readonly serverUsername: string;
  readonly serverPassword?: string;
  readonly openCodePath?: string;
}

/** Load and normalize extension preferences. Sensible defaults, nothing required. */
export function loadConfig(): Config {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const serverUrl = preferences.serverUrl?.trim();
  const serverPassword = preferences.serverPassword?.trim();
  const openCodePath = preferences.openCodePath?.trim();
  return {
    ...(serverUrl ? { serverUrl } : {}),
    serverUsername: preferences.serverUsername?.trim() || "opencode",
    ...(serverPassword ? { serverPassword } : {}),
    ...(openCodePath ? { openCodePath } : {}),
  };
}
