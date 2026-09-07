import { WEEKDAYS, Weekday } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.round(ms / 1000);
  const units = [
    { label: "d", value: 86400 },
    { label: "h", value: 3600 },
    { label: "m", value: 60 },
    { label: "s", value: 1 },
  ];

  const parts: string[] = [];
  let remaining = totalSeconds;
  for (const unit of units) {
    const amount = Math.floor(remaining / unit.value);
    remaining %= unit.value;
    if (amount > 0) parts.push(`${amount}${unit.label}`);
  }
  return parts.length > 0 ? parts.join(" ") : "0s";
}

export function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[date.getDay()];
}

export function titleDay(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export function parseMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Accept 11, 08, 8:00, 11:00 on a 24-hour clock. */
export function normalizeClockInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const hourOnly = /^(\d{1,2})$/.exec(trimmed);
  if (hourOnly) {
    const hour = Number(hourOnly[1]);
    if (hour > 23) return null;
    return `${pad2(hour)}:00`;
  }

  const withColon = parseMinutes(trimmed);
  if (withColon !== null) {
    return minutesToHHMM(withColon);
  }

  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(trimmed);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const ampm = match[3];
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function minutesToHHMM(minutes: number): string {
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${pad2(hours)}:${pad2(mins)}`;
}

export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const minutes = Number(text);
    return minutes > 0 ? minutes * MINUTE : null;
  }

  const hms = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  if (hms) {
    const hours = Number(hms[1]);
    const minutes = Number(hms[2]);
    const seconds = Number(hms[3] ?? 0);
    if (minutes > 59 || seconds > 59) return null;
    const ms = hours * HOUR + minutes * MINUTE + seconds * 1000;
    return ms > 0 ? ms : null;
  }

  const pattern = /(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/;
  const match = pattern.exec(text);
  if (!match || match[0] !== text || (!match[1] && !match[2] && !match[3])) return null;

  const ms =
    Number(match[1] ?? 0) * HOUR + Number(match[2] ?? 0) * MINUTE + Number(match[3] ?? 0) * 1000;
  return ms > 0 ? ms : null;
}

export function parseClockTime(input: string, now = new Date()): Date | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const match = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!match) return null;

  const hourStr = match[1];
  const inputHour = Number(hourStr);
  const minute = match[2] ? Number(match[2]) : 0;
  const second = match[3] ? Number(match[3]) : 0;
  const ampm = match[4];

  if (minute > 59 || second > 59) return null;

  let hour = inputHour;
  if (ampm === "pm" && inputHour < 12) hour += 12;
  if (ampm === "am" && inputHour === 12) hour = 0;
  if (!ampm && inputHour === 24 && minute === 0 && second === 0) hour = 0;
  if (hour > 23) return null;

  const target = new Date(now);
  target.setHours(hour, minute, second, 0);

  const explicit = Boolean(ampm) || inputHour > 12 || hourStr.length === 2 || Boolean(match[2]);
  while (target.getTime() <= now.getTime()) {
    target.setHours(target.getHours() + (explicit ? 24 : 12));
  }

  return target;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export { MINUTE, HOUR, DAY };
