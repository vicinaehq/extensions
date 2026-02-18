import { format, isToday, isTomorrow, isThisWeek, isThisMonth } from "date-fns";
import { CalendarEvent } from "../types";

/**
 * Event grouping sections
 */
export type EventSection =
  | "Today"
  | "Tomorrow"
  | "Next Week"
  | "Rest of Month"
  | string; // Month name for future months

/**
 * Grouped events by section
 */
export interface GroupedEvents {
  [section: string]: CalendarEvent[];
}

/**
 * Group events into date-based sections
 */
export function groupEventsByDate(events: CalendarEvent[]): GroupedEvents {
  const groups: GroupedEvents = {};
  const now = new Date();

  events.forEach((event) => {
    const section = getEventSection(event.startTime, now);

    if (!groups[section]) {
      groups[section] = [];
    }

    groups[section].push(event);
  });

  // Sort each group by start time
  Object.values(groups).forEach((eventList) => {
    eventList.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  });

  return groups;
}

/**
 * Determine which section an event belongs to
 */
function getEventSection(eventDate: Date, now: Date): EventSection {
  if (isToday(eventDate)) {
    return "Today";
  }

  if (isTomorrow(eventDate)) {
    return "Tomorrow";
  }

  // Next Week (but not today/tomorrow, and within this week)
  if (isThisWeek(eventDate, { weekStartsOn: 1 })) {
    return "Next Week";
  }

  // Rest of This Month
  if (isThisMonth(eventDate)) {
    return "Rest of Month";
  }

  // Future months - use month name
  return format(eventDate, "MMMM yyyy");
}

/**
 * Get ordered list of sections (for consistent display order)
 */
export function getSectionOrder(sections: string[]): string[] {
  const order = ["Today", "Tomorrow", "Next Week", "Rest of Month"];

  // Sort remaining sections (month names) chronologically
  const monthSections = sections
    .filter((s) => !order.includes(s))
    .sort((a, b) => {
      // Parse month name and compare
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA.getTime() - dateB.getTime();
    });

  return [...order.filter((s) => sections.includes(s)), ...monthSections];
}

/**
 * Format event time for display
 */
export function formatEventTime(event: CalendarEvent): string {
  if (event.isAllDay) return "All day";

  const eventDate = event.startTime;

  if (isToday(eventDate)) return format(eventDate, "h:mm a");
  if (isThisWeek(eventDate, { weekStartsOn: 1 })) return format(eventDate, "EEE h:mm a");

  return format(eventDate, "MMM d, h:mm a");
}

/**
 * Format event duration
 */
export function formatEventDuration(event: CalendarEvent): string {
  if (event.isAllDay) return "";

  const durationMinutes = Math.floor((event.endTime.getTime() - event.startTime.getTime()) / 60000);

  if (durationMinutes < 60) return `${durationMinutes}m`;

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * Get relative time description (e.g., "in 2 hours", "Happening now")
 */
export function getRelativeTime(event: CalendarEvent): string | null {
  const now = new Date();

  // Event is happening now
  if (now >= event.startTime && now <= event.endTime) {
    return "Happening now";
  }

  // Event hasn't started yet
  if (now < event.startTime) {
    const diffMinutes = Math.floor((event.startTime.getTime() - now.getTime()) / 60000);

    if (diffMinutes < 60) return `in ${diffMinutes}m`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `in ${diffHours}h`;
  }

  return null; // Don't show for past or >24h future events
}

/**
 * Check if event is happening soon (within next 15 minutes)
 */
export function isEventSoon(event: CalendarEvent): boolean {
  const now = new Date();
  const diffMinutes = (event.startTime.getTime() - now.getTime()) / 60000;
  return diffMinutes > 0 && diffMinutes <= 15;
}

/**
 * Check if event is currently happening
 */
export function isEventNow(event: CalendarEvent): boolean {
  const now = new Date();
  return now >= event.startTime && now <= event.endTime;
}

/**
 * Parse duration string to minutes
 * Supports formats: "30", "30m", "1h", "1h30m", "90m"
 *
 * @param duration - Duration string to parse
 * @returns Duration in minutes, or null if invalid
 */
export function parseDuration(duration: string): number | null {
  const trimmed = duration.trim().toLowerCase();
  if (!trimmed) return null;

  // Match patterns like "1h30m", "1h", "30m", "30"
  const pattern = /^(?:(\d+)h)?(?:(\d+)m?)?$/;
  const match = trimmed.match(pattern);

  if (!match) return null;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);

  // If both are 0, invalid
  if (hours === 0 && minutes === 0) return null;

  return hours * 60 + minutes;
}

/**
 * Calculate end time from start time and duration
 *
 * @param startTime - Event start time
 * @param durationMinutes - Duration in minutes
 * @returns End time
 */
export function calculateEndTime(startTime: Date, durationMinutes: number): Date {
  return new Date(startTime.getTime() + durationMinutes * 60000);
}
