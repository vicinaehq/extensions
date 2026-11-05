import type { GoogleEvent } from "../api/calendar";

/** Google's canonical event colors (keys "1".."11"). */
export const GOOGLE_EVENT_COLORS: Record<string, { name: string; hex: string }> = {
  "1": { name: "Lavender", hex: "#7986cb" },
  "2": { name: "Sage", hex: "#33b679" },
  "3": { name: "Grape", hex: "#8e24aa" },
  "4": { name: "Flamingo", hex: "#e67c73" },
  "5": { name: "Banana", hex: "#f6bf26" },
  "6": { name: "Tangerine", hex: "#f4511e" },
  "7": { name: "Peacock", hex: "#039be5" },
  "8": { name: "Graphite", hex: "#616161" },
  "9": { name: "Blueberry", hex: "#3f51b5" },
  "10": { name: "Basil", hex: "#0b8043" },
  "11": { name: "Tomato", hex: "#d50000" },
};

/**
 * Return the event's colorId when it is a valid Google color (1..11),
 * otherwise `undefined` so the caller can fall back to the calendar color.
 */
export function resolveEventColorId(
  event: Pick<GoogleEvent, "colorId"> | undefined,
): string | undefined {
  const colorId = event?.colorId;
  if (typeof colorId === "string" && GOOGLE_EVENT_COLORS[colorId] !== undefined) {
    return colorId;
  }
  return undefined;
}

/** Resolve the display hex for an event: its own colorId wins, else the calendar color. */
export function resolveEventColorHex(
  event: Pick<GoogleEvent, "colorId"> | undefined,
  calendarBackgroundColor?: string,
): string | undefined {
  const colorId = resolveEventColorId(event);
  if (colorId) return GOOGLE_EVENT_COLORS[colorId].hex;
  return calendarBackgroundColor;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split on commas/semicolons/whitespace/newlines, validate, lowercase, dedupe. */
export function parseAttendeeEmails(input: string): string[] {
  return splitAttendeeEmails(input).valid;
}

export interface SplitAttendeeEmails {
  valid: string[];
  invalid: string[];
}

/**
 * Like `parseAttendeeEmails` but also reports the offending tokens so the
 * UI can warn about typo'd guests instead of silently dropping them.
 * Invalid tokens are lowercased, de-duplicated, order-preserving.
 */
export function splitAttendeeEmails(input: string): SplitAttendeeEmails {
  if (!input || typeof input !== "string") return { valid: [], invalid: [] };
  const seenValid = new Set<string>();
  const seenInvalid = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of input.split(/[,\s;]+/)) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed.length === 0) continue;
    if (!EMAIL_RE.test(trimmed)) {
      if (!seenInvalid.has(trimmed)) {
        seenInvalid.add(trimmed);
        invalid.push(trimmed);
      }
      continue;
    }
    if (seenValid.has(trimmed)) continue;
    seenValid.add(trimmed);
    valid.push(trimmed);
  }
  return { valid, invalid };
}

const DAY_LABELS: Record<string, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

const FREQ_SINGULAR: Record<string, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};

function formatUntilDate(raw: string): string | undefined {
  // UNTIL is typically YYYYMMDD or YYYYMMDDTHHMMSSZ.
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
  if (!m) {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
      parsed,
    );
  }
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Humanize an RRULE string, e.g. `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE`
 * -> `Every 2 weeks on Mon, Wed`. Unknown parts are ignored gracefully;
 * undefined/invalid input yields `undefined`.
 */
export function formatRecurrenceRule(rrule: string | undefined): string | undefined {
  if (typeof rrule !== "string" || rrule.trim().length === 0) return undefined;
  // Take the first RRULE line if several lines were passed.
  const line = rrule
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.toUpperCase().startsWith("RRULE:"));
  if (!line) return undefined;
  const body = line.slice("RRULE:".length);
  if (!body) return undefined;

  const props: Record<string, string> = {};
  for (const part of body.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    if (key && value) props[key] = value;
  }

  const freq = (props["FREQ"] ?? "").toUpperCase();
  const singular = FREQ_SINGULAR[freq];
  if (!singular) return undefined;

  let interval = 1;
  if (props["INTERVAL"] !== undefined) {
    const n = Number(props["INTERVAL"]);
    if (Number.isFinite(n) && n >= 1) interval = Math.floor(n);
  }

  const plural = `${singular}s`;
  let text = interval === 1 ? `Every ${singular}` : `Every ${interval} ${plural}`;

  if (props["BYDAY"]) {
    const days = props["BYDAY"]
      .split(",")
      .map((d) => d.trim().toUpperCase().replace(/^[+-]?\d+/, ""))
      .map((d) => DAY_LABELS[d])
      .filter((d): d is string => typeof d === "string");
    if (days.length > 0) {
      text += ` on ${days.join(", ")}`;
    }
  }

  if (props["COUNT"] !== undefined) {
    const n = Number(props["COUNT"]);
    if (Number.isFinite(n) && n >= 1) {
      text += `, ${Math.floor(n)} times`;
    }
  } else if (props["UNTIL"]) {
    const until = formatUntilDate(props["UNTIL"]);
    if (until) text += ` until ${until}`;
  }

  return text;
}

export function getAttendeeSummary(
  event: Pick<GoogleEvent, "attendees"> | undefined,
): string | undefined {
  const attendees = event?.attendees;
  if (!Array.isArray(attendees) || attendees.length === 0) return undefined;
  if (attendees.length === 1) {
    const only = attendees[0];
    return only.displayName || only.email || undefined;
  }
  return `${attendees.length} guests`;
}

export function getResponseStatusLabel(
  status: string | undefined,
): "Accepted" | "Declined" | "Tentative" | "No reply" | undefined {
  if (typeof status !== "string") return undefined;
  switch (status.toLowerCase()) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "tentative":
      return "Tentative";
    case "needsaction":
      return "No reply";
    default:
      return undefined;
  }
}
