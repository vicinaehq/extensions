/**
 * Helpers for the reserved URL scheme used to represent calendars read from
 * the local macOS Calendar (EventKit) instead of an iCal feed.
 */
export const MACOS_URL_PREFIX = "macos://";

export function isMacOS(): boolean {
  return process.platform === "darwin";
}

export function isMacOSCalendarUrl(url: string): boolean {
  return url.startsWith(MACOS_URL_PREFIX);
}

export function macosCalendarUrl(identifier: string): string {
  return `${MACOS_URL_PREFIX}${identifier}`;
}

export function macosCalendarIdentifier(url: string): string {
  return url.slice(MACOS_URL_PREFIX.length);
}
