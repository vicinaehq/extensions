import { Schedule, Weekday, WEEKDAYS } from "./types";
import { addDays, minutesToHHMM, parseClockTime, parseMinutes, startOfDay, titleDay, weekdayOf } from "./time";

export interface ParsedSchedule {
  days: Weekday[];
  from: string;
  to: string;
}

export interface ActiveWindow {
  schedule: Schedule;
  endsAt: number;
}

const DAY_LOOKUP: Record<string, Weekday> = {
  sun: "sunday",
  sunday: "sunday",
  mon: "monday",
  monday: "monday",
  tue: "tuesday",
  tues: "tuesday",
  tuesday: "tuesday",
  wed: "wednesday",
  wednesday: "wednesday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  thursday: "thursday",
  fri: "friday",
  friday: "friday",
  sat: "saturday",
  saturday: "saturday",
};

export function parseNaturalSchedule(input: string, now = new Date()): ParsedSchedule | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const times = extractTimes(text, now);
  if (times.length < 2) return null;

  const [from, to] = times;
  if (from === to) return null;

  const except = /\bexcept\b/.test(text);
  let days = extractDays(text);

  if (except) {
    if (days.length === 0) return null;
    const excluded = new Set(days);
    days = WEEKDAYS.filter((day) => !excluded.has(day));
  } else if (days.length === 0) {
    days = [...WEEKDAYS];
  }

  return { days, from, to };
}

export function activeWindow(schedule: Schedule, now = new Date()): ActiveWindow | null {
  if (schedule.paused) return null;
  if (schedule.skipUntil && now.getTime() < schedule.skipUntil) return null;

  const fromM = parseMinutes(schedule.from);
  const toM = parseMinutes(schedule.to);
  if (fromM === null || toM === null) return null;

  const nowM = now.getHours() * 60 + now.getMinutes();
  const today = weekdayOf(now);
  const overnight = fromM > toM;

  if (!overnight) {
    if (!schedule.days.includes(today) || nowM < fromM || nowM >= toM) return null;
    return { schedule, endsAt: atMinutes(now, toM).getTime() };
  }

  const yesterday = weekdayOf(addDays(now, -1));
  if (nowM >= fromM && schedule.days.includes(today)) {
    return { schedule, endsAt: atMinutes(addDays(now, 1), toM).getTime() };
  }
  if (nowM < toM && schedule.days.includes(yesterday)) {
    return { schedule, endsAt: atMinutes(now, toM).getTime() };
  }
  return null;
}

export function nextWindowStart(schedule: Schedule, now = new Date()): Date | null {
  if (schedule.paused) return null;
  const fromM = parseMinutes(schedule.from);
  if (fromM === null) return null;

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addDays(startOfDay(now), offset);
    const day = weekdayOf(date);
    if (!schedule.days.includes(day)) continue;
    const start = atMinutes(date, fromM);
    if (start.getTime() > now.getTime()) return start;
  }
  return null;
}

export function createScheduleId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const WEEK_ORDER: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export function sortDays(days: Weekday[]): Weekday[] {
  return WEEK_ORDER.filter((day) => days.includes(day));
}

export function formatDayList(days: Weekday[]): string {
  const ordered = sortDays(days);
  if (ordered.length === 7) return "Every day";
  if (ordered.length === 5 && WEEK_ORDER.slice(0, 5).every((day, index) => ordered[index] === day)) {
    return "Weekdays";
  }
  if (ordered.length === 2 && ordered[0] === "saturday" && ordered[1] === "sunday") {
    return "Weekend";
  }

  const indexes = ordered.map((day) => WEEK_ORDER.indexOf(day));
  const ranges: string[] = [];
  let start = 0;
  while (start < indexes.length) {
    let end = start;
    while (end + 1 < indexes.length && indexes[end + 1] === indexes[end] + 1) end += 1;
    const from = titleDay(WEEK_ORDER[indexes[start]]);
    const to = titleDay(WEEK_ORDER[indexes[end]]);
    ranges.push(start === end ? from : `${from}–${to}`);
    start = end + 1;
  }
  return ranges.join(", ");
}

export function formatTimeRange(from: string, to: string): string {
  return `${from} – ${to}`;
}

export function isOvernight(from: string, to: string): boolean {
  const start = parseMinutes(from);
  const end = parseMinutes(to);
  if (start === null || end === null) return false;
  return start > end;
}

export function sortSchedules(schedules: Schedule[], now = new Date()): Schedule[] {
  return [...schedules]
    .map((schedule) => ({ ...schedule, days: sortDays(schedule.days) }))
    .sort((left, right) => {
      const leftBrewing = Boolean(activeWindow(left, now));
      const rightBrewing = Boolean(activeWindow(right, now));
      if (leftBrewing !== rightBrewing) return leftBrewing ? -1 : 1;
      if (left.paused !== right.paused) return left.paused ? 1 : -1;

      const leftNext = nextWindowStart(left, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightNext = nextWindowStart(right, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftNext !== rightNext) return leftNext - rightNext;

      return (parseMinutes(left.from) ?? 0) - (parseMinutes(right.from) ?? 0);
    });
}

export function scheduleLabel(schedule: Schedule, now = new Date()): "Brewing" | "Paused" | "Scheduled" {
  if (schedule.paused) return "Paused";
  if (activeWindow(schedule, now)) return "Brewing";
  return "Scheduled";
}

export function runsToday(schedule: Schedule, now = new Date()): boolean {
  if (activeWindow(schedule, now)) return true;
  return schedule.days.includes(weekdayOf(now));
}

export function formatNextStart(date: Date, now = new Date()): string {
  const clock = minutesToHHMM(date.getHours() * 60 + date.getMinutes());
  const today = startOfDay(now);
  const target = startOfDay(date);
  const diff = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return `today at ${clock}`;
  if (diff === 1) return `tomorrow at ${clock}`;
  return `${titleDay(weekdayOf(date))} at ${clock}`;
}

function atMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

function extractTimes(text: string, now: Date): string[] {
  const found: string[] = [];
  const regex =
    /(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)|(\d{1,2}\s*(?:am|pm))|(\d{1,2}h\d{2})/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const raw = match[0].replace(/h/, ":").replace(/\s+/g, "");
    const parsed = parseClockTime(raw, now) ?? parseClockTime(`${raw}`, now);
    const minutes = hhmmFromLoose(raw);
    if (minutes !== null) {
      found.push(minutesToHHMM(minutes));
    } else if (parsed) {
      found.push(`${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`);
    }
  }
  return found;
}

function hhmmFromLoose(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  const ampm = /am|pm/.exec(text)?.[0];
  const nums = /^(\d{1,2})(?::(\d{2}))?/.exec(text.replace(/(am|pm)/, ""));
  if (!nums) return null;
  let hour = Number(nums[1]);
  const minute = Number(nums[2] ?? 0);
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  if (!ampm && hour > 23) return null;
  return hour * 60 + minute;
}

function extractDays(text: string): Weekday[] {
  if (/\b(every\s*day|everyday|daily|all\s*days?)\b/.test(text)) return [...WEEKDAYS];
  if (/\bweekdays?\b/.test(text) || /\bmon(?:day)?\s*(?:[-–]|to)\s*fri(?:day)?\b/.test(text)) {
    return ["monday", "tuesday", "wednesday", "thursday", "friday"];
  }
  if (/\bweekends?\b/.test(text)) return ["saturday", "sunday"];

  const range = /\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?\s*(?:[-–]|to)\s*(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?\b/.exec(
    text,
  );
  if (range) {
    const start = DAY_LOOKUP[range[1]];
    const end = DAY_LOOKUP[range[2]];
    if (start && end) return daysInRange(start, end);
  }

  const days: Weekday[] = [];
  const seen = new Set<Weekday>();
  const token = /\b(sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text))) {
    const key = match[1].replace(/s$/, "");
    const day = DAY_LOOKUP[key] ?? DAY_LOOKUP[match[1]];
    if (day && !seen.has(day)) {
      seen.add(day);
      days.push(day);
    }
  }
  return days;
}

function daysInRange(from: Weekday, to: Weekday): Weekday[] {
  const start = WEEKDAYS.indexOf(from);
  const end = WEEKDAYS.indexOf(to);
  const days: Weekday[] = [];
  for (let i = 0; i < 7; i += 1) {
    const index = (start + i) % 7;
    days.push(WEEKDAYS[index]);
    if (index === end) break;
  }
  return days;
}
