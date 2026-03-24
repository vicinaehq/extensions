import { Cache } from "@vicinae/api";
import { Calendar } from "./types";

const cache = new Cache();

export const getCalendars = (): Calendar[] => {
  const calendars = cache.get("calendars");
  return calendars ? JSON.parse(calendars) : [];
};

export const setCalendars = (calendars: Calendar[]) => {
  cache.set("calendars", JSON.stringify(calendars));
};

export const getCalendarName = (calendar: Calendar): string => {
  if (calendar.name) {
    return calendar.name;
  }
  // Fallback: Try to extract a meaningful name from the URL
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
