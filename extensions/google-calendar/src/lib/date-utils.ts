import { differenceInCalendarDays, startOfDay } from "date-fns";
import type { EventDateTime } from "../api/calendar";

/**
 * Pure date helpers for the Google Calendar extension.
 * System timezone is used throughout; no timezone library is pulled in.
 */

const DEFAULT_DURATION_MINUTES = 30;
const DEFAULT_DAYS_TO_SHOW = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 30;

export function resolveEventDurationMinutes(
  preferenceValue: string | number | undefined,
  fallbackMinutes?: number,
): number {
  const fallback =
    typeof fallbackMinutes === "number" &&
    Number.isFinite(fallbackMinutes) &&
    fallbackMinutes > 0
      ? Math.floor(fallbackMinutes)
      : DEFAULT_DURATION_MINUTES;

  if (preferenceValue === undefined || preferenceValue === null) {
    return fallback;
  }
  const parsed =
    typeof preferenceValue === "number" ? preferenceValue : Number(preferenceValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function computeTimeRange(
  daysToShow: string | number | undefined,
  now?: Date,
): { timeMin: string; timeMax: string } {
  const base = now ?? new Date();
  let days =
    daysToShow === undefined || daysToShow === null
      ? DEFAULT_DAYS_TO_SHOW
      : Number(daysToShow);
  if (!Number.isFinite(days)) {
    days = DEFAULT_DAYS_TO_SHOW;
  }
  days = Math.floor(days);
  if (days < MIN_DAYS) days = MIN_DAYS;
  if (days > MAX_DAYS) days = MAX_DAYS;
  const timeMin = base.toISOString();
  const timeMax = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return { timeMin, timeMax };
}

export function isAllDay(eventDateTime: EventDateTime | undefined): boolean {
  if (!eventDateTime) return false;
  return typeof eventDateTime.date === "string" && typeof eventDateTime.dateTime !== "string";
}

function parseEventDate(value: EventDateTime | undefined): Date | undefined {
  if (!value) return undefined;
  const raw = value.dateTime ?? value.date;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export function formatEventTimeRange(
  start: EventDateTime | undefined,
  end: EventDateTime | undefined,
  options?: { timeZone?: string; includeDate?: boolean; locale?: string },
): string {
  if (isAllDay(start) || isAllDay(end)) {
    return "All day";
  }
  const startDate = parseEventDate(start);
  if (!startDate) return "";
  const endDate = parseEventDate(end);
  const locale = options?.locale ?? "en-US";
  const timeZone = options?.timeZone;
  const timeFormat = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  if (!endDate) {
    if (options?.includeDate) {
      const dateFormat = new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        ...(timeZone ? { timeZone } : {}),
      });
      return `${dateFormat.format(startDate)} ${timeFormat.format(startDate)}`;
    }
    return timeFormat.format(startDate);
  }
  const range = `${timeFormat.format(startDate)} – ${timeFormat.format(endDate)}`;
  if (options?.includeDate) {
    const dateFormat = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      ...(timeZone ? { timeZone } : {}),
    });
    return `${dateFormat.format(startDate)} ${range}`;
  }
  return range;
}

export function formatEventDayGroup(
  eventDateTime: EventDateTime | undefined,
  now?: Date,
): "Today" | "Tomorrow" | "Upcoming" | "Past" {
  const eventDate = parseEventDate(eventDateTime);
  if (!eventDate) return "Upcoming";
  const base = now ?? new Date();
  const diff = differenceInCalendarDays(startOfDay(eventDate), startOfDay(base));
  if (diff < 0) return "Past";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return "Upcoming";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Offset-preserving ISO 8601 for the Google API, e.g.
 * `2026-10-14T09:00:00+05:30`. Unlike `toISOString()` (always UTC),
 * this keeps the local wall-clock time with its numeric offset.
 */
export function toLocalISOString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}` +
    `${sign}${pad2(hours)}:${pad2(minutes)}`
  );
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
