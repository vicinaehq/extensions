/**
 * Lazy access to getPreferenceValues: a static import of @vicinae/api crashes
 * at module load outside the Vicinae host (its init reads host globals), and
 * unit tests must run under plain tsx. So require it only when actually
 * reading preferences — a path tests never touch (they inject a fake map via
 * setRawPreferencesForTesting).
 */

let rawPreferencesOverride: Record<string, unknown> | null = null;

/**
 * Test-only seam: inject a fake preference map so unit tests can exercise
 * preference parsing without the Vicinae host. Pass null to restore.
 * Never call from extension code.
 */
export function setRawPreferencesForTesting(prefs: Record<string, unknown> | null): void {
  rawPreferencesOverride = prefs;
}

function readRawPreferences(): Record<string, unknown> {
  if (rawPreferencesOverride) return rawPreferencesOverride;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api = require("@vicinae/api") as typeof import("@vicinae/api");
  return api.getPreferenceValues<Record<string, unknown>>();
}

export interface ExtensionPreferences {
  googleClientId?: string;
  googleClientSecret?: string;
  refreshToken?: string;
  defaultCalendarId?: string;
  defaultEventDuration: string;
  sendInvitations: "all" | "externalOnly" | "none";
  addSignature: boolean;
}

export interface ListEventsPreferences {
  daysToShow: string;
  showLocation: boolean;
  openCommandJoinsMeeting: boolean;
}

/** Textfield/password preferences come back as "" when unset — normalize to undefined. */
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function isSendUpdatesValue(value: unknown): value is "all" | "externalOnly" | "none" {
  return value === "all" || value === "externalOnly" || value === "none";
}

/** Single shared validator: unknown/stale stored values fall back to "all". */
function parseSendUpdates(value: unknown): "all" | "externalOnly" | "none" {
  return isSendUpdatesValue(value) ? value : "all";
}

/**
 * Read the extension-level `sendInvitations` preference, validated.
 * This is the single shared implementation — command views must call this
 * instead of reading the raw preference themselves.
 */
export function readSendUpdates(): "all" | "externalOnly" | "none" {
  return parseSendUpdates(readRawPreferences()["sendInvitations"]);
}

export function getExtensionPreferences(): ExtensionPreferences {
  const raw = readRawPreferences();
  return {
    googleClientId: optionalString(raw["googleClientId"]),
    googleClientSecret: optionalString(raw["googleClientSecret"]),
    refreshToken: optionalString(raw["refreshToken"]),
    defaultCalendarId: optionalString(raw["defaultCalendarId"]),
    defaultEventDuration: optionalString(raw["defaultEventDuration"]) ?? "30",
    sendInvitations: parseSendUpdates(raw["sendInvitations"]),
    addSignature: raw["addSignature"] === undefined ? true : raw["addSignature"] === true,
  };
}

export function getListEventsPreferences(): ListEventsPreferences {
  const raw = readRawPreferences();
  return {
    daysToShow: optionalString(raw["daysToShow"]) ?? "7",
    showLocation: raw["showLocation"] === true,
    openCommandJoinsMeeting: raw["openCommandJoinsMeeting"] === true,
  };
}
