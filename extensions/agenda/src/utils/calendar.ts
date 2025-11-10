import { Cache } from "@vicinae/api";
import { Calendar } from "../types";

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

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return "Tomorrow";
  } else {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
};