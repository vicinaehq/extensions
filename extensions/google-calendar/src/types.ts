import { calendar_v3 } from "@googleapis/calendar";

/**
 * OAuth token storage structure
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number; // Unix timestamp in milliseconds
}

/**
 * User preferences from package.json
 */
export interface Preferences {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Transformed calendar event for UI display
 */
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  attendees?: Attendee[];
  meetLink?: string;
  htmlLink: string;
  description?: string;
  location?: string;
  calendarId: string;
  status?: "confirmed" | "tentative" | "cancelled";
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  recurrence?: string[];
  recurringEventId?: string;
}

/**
 * Event attendee
 */
export interface Attendee {
  email: string;
  name?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  self?: boolean;
}

/**
 * Google Calendar metadata
 */
export interface Calendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: string;
}

/**
 * Event creation data
 */
export interface CreateEventData {
  title: string;
  startTime: Date;
  endTime: Date;
  description?: string;
  location?: string;
  attendees?: string[];
  createMeet?: boolean;
}

/**
 * Cache entry with timestamp
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
