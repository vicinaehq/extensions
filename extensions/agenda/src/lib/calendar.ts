import { Cache } from "@vicinae/api";
import { Calendar } from "./types";
import { isLocalPath, expandPath } from "./localPath";
import { MACOS_ENABLED_KEY } from "./constants";
import { isMacOSCalendarUrl } from "./macosUrl";

const cache = new Cache();

export const getCalendars = (): Calendar[] => {
  const calendars = cache.get("calendars");
  return calendars ? JSON.parse(calendars) : [];
};

export const setCalendars = (calendars: Calendar[]) => {
  cache.set("calendars", JSON.stringify(calendars));
};

/**
 * Whether the user opted in to reading the local macOS Calendar. Off by
 * default, because it requires a macOS privacy permission.
 */
export const isMacOSEnabled = (): boolean =>
  cache.get(MACOS_ENABLED_KEY) === "true";

export const setMacOSEnabled = (enabled: boolean): void => {
  cache.set(MACOS_ENABLED_KEY, enabled ? "true" : "false");
};

/**
 * Calendars that should actually be read and shown. macOS calendars are
 * hidden while the opt-in flag is off, but the selection itself is kept so it
 * comes back when the user re-enables it.
 */
export const getActiveCalendars = (): Calendar[] => {
  const calendars = getCalendars();
  return isMacOSEnabled()
    ? calendars
    : calendars.filter((calendar) => !isMacOSCalendarUrl(calendar.url));
};

export const getCalendarName = (calendar: Calendar): string => {
  if (calendar.name) {
    return calendar.name;
  }
  if (isLocalPath(calendar.url)) {
    const dirPath = expandPath(calendar.url);
    const parts = dirPath.split("/").filter((p) => p);
    return parts[parts.length - 1] || calendar.url;
  }

  try {
    const urlObj = new URL(calendar.url);
    const pathParts = urlObj.pathname.split("/").filter((p) => p);
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && lastPart !== "ical") {
      return decodeURIComponent(lastPart).replace(/%20/g, " ");
    }
    return urlObj.hostname;
  } catch {
    return calendar.url;
  }
};

/**
 * Parse YYYY-MM-DD string as local date components to avoid timezone shifts
 */
const parseDateString = (dateString: string): Date => {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const formatDate = (dateString: string) => {
  const date = parseDateString(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  if (date.getTime() === today.getTime()) {
    return "Today";
  } else if (date.getTime() === tomorrow.getTime()) {
    return "Tomorrow";
  } else {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
};
