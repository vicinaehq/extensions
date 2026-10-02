import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { VEvent } from "node-ical";
import { isMacOS } from "./macosUrl";

const execFileAsync = promisify(execFile);

/**
 * How long the JXA script waits for the user to answer the macOS permission
 * prompt before giving up. Only relevant the very first time access is asked.
 */
const ACCESS_REQUEST_TIMEOUT_MS = 45000;

/** Hard timeout for the osascript process, needs to outlive the request above. */
const EXEC_TIMEOUT_MS = 60000;

export const CalendarAuthStatus = {
  NotDetermined: 0,
  Restricted: 1,
  Denied: 2,
  Authorized: 3,
  FullAccess: 4,
  WriteOnly: 5,
} as const;

export type CalendarAuthStatusValue =
  (typeof CalendarAuthStatus)[keyof typeof CalendarAuthStatus];

export interface MacOSCalendarInfo {
  id: string;
  title: string;
  /** Account the calendar belongs to, e.g. "iCloud" or "Google". */
  source: string | null;
  /** False for read-only calendars such as holidays or birthdays. */
  allowed: boolean;
}

export interface MacOSRawEvent {
  id: string | null;
  title: string | null;
  /** Epoch milliseconds. */
  start: number;
  /** Epoch milliseconds. */
  end: number;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  url: string | null;
  calendarId: string | null;
}

export interface MacOSBridgeResult {
  status: number;
  calendars: MacOSCalendarInfo[];
  events: MacOSRawEvent[];
}

/**
 * JavaScript for Automation source executed through osascript. It bridges to
 * EventKit, which reads the same calendars the macOS Calendar.app shows,
 * including iCloud, Google and Exchange accounts, with recurrence already
 * expanded for the requested range.
 */
function buildScript(params: { from?: number; to?: number }): string {
  return `
ObjC.import("Foundation");
ObjC.import("EventKit");

function unwrap(value) {
  return value === undefined || value === null ? null : ObjC.unwrap(value);
}

function buildEvent(event) {
  try {
    return {
      id: unwrap(event.eventIdentifier),
      title: unwrap(event.title),
      start: event.startDate.timeIntervalSince1970 * 1000,
      end: event.endDate.timeIntervalSince1970 * 1000,
      allDay: Boolean(event.isAllDay),
      location: unwrap(event.location),
      notes: unwrap(event.notes),
      url: event.URL ? unwrap(event.URL.absoluteString) : null,
      calendarId: unwrap(event.calendar.calendarIdentifier)
    };
  } catch (error) {
    return null;
  }
}

function run() {
  var params = ${JSON.stringify(params)};
  var store = $.EKEventStore.alloc.init;
  var status = Number($.EKEventStore.authorizationStatusForEntityType(0));
  var result = { status: status, calendars: [], events: [] };

  if (status === 0) {
    // The completion block never fires under JXA, so we ask and then poll the
    // authorization status while pumping the run loop.
    store.requestFullAccessToEventsWithCompletion($((ok, err) => {}));
    var deadline = Date.now() + ${ACCESS_REQUEST_TIMEOUT_MS};
    while (
      Number($.EKEventStore.authorizationStatusForEntityType(0)) === 0 &&
      Date.now() < deadline
    ) {
      $.NSRunLoop.currentRunLoop.runModeBeforeDate(
        $.NSDefaultRunLoopMode,
        $.NSDate.dateWithTimeIntervalSinceNow(0.2)
      );
    }
    status = Number($.EKEventStore.authorizationStatusForEntityType(0));
    result.status = status;
  }

  if (status !== 3 && status !== 4) {
    return JSON.stringify(result);
  }

  var calendars = store.calendarsForEntityType(0);
  for (var c = 0; c < calendars.count; c++) {
    var calendar = calendars.objectAtIndex(c);
    result.calendars.push({
      id: unwrap(calendar.calendarIdentifier),
      title: unwrap(calendar.title),
      source: calendar.source ? unwrap(calendar.source.title) : null,
      allowed: Boolean(calendar.allowsContentModifications)
    });
  }

  if (params.from !== undefined && params.to !== undefined) {
    var start = $.NSDate.dateWithTimeIntervalSince1970(params.from / 1000);
    var end = $.NSDate.dateWithTimeIntervalSince1970(params.to / 1000);
    var predicate = store.predicateForEventsWithStartDateEndDateCalendars(
      start,
      end,
      $()
    );
    var events = store.eventsMatchingPredicate(predicate);
    for (var i = 0; i < events.count; i++) {
      var event = buildEvent(events.objectAtIndex(i));
      if (event) {
        result.events.push(event);
      }
    }
  }

  return JSON.stringify(result);
}
`;
}

async function runBridge(params: {
  from?: number;
  to?: number;
}): Promise<MacOSBridgeResult> {
  if (!isMacOS()) {
    throw new Error("macOS Calendar is only available on macOS");
  }

  const dir = await mkdtemp(join(tmpdir(), "agenda-macos-"));
  const scriptPath = join(dir, "calendar.js");

  try {
    await writeFile(scriptPath, buildScript(params), "utf8");
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", scriptPath],
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as MacOSBridgeResult;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Read the list of local calendars, triggering the permission prompt if needed. */
export function listMacOSCalendars(): Promise<MacOSBridgeResult> {
  return runBridge({});
}

/** Read events in the given range from all local calendars. */
export function fetchMacOSEvents(
  from: Date,
  to: Date,
): Promise<MacOSBridgeResult> {
  return runBridge({ from: from.getTime(), to: to.getTime() });
}

export function hasMacOSAccess(status: number): boolean {
  return (
    status === CalendarAuthStatus.Authorized ||
    status === CalendarAuthStatus.FullAccess
  );
}

/**
 * EventKit reports all-day events with an exclusive end date. Normalize the
 * bounds to local midnight so the shared all-day detection keeps working.
 */
export function normalizeAllDayBounds(ms: number): { start: Date; end: Date } {
  const date = new Date(ms);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 1,
  );
  return { start, end };
}

export function toAgendaEvent(raw: MacOSRawEvent, fallbackUid: string): VEvent {
  const bounds = raw.allDay
    ? normalizeAllDayBounds(raw.start)
    : { start: new Date(raw.start), end: new Date(raw.end) };

  return {
    type: "VEVENT",
    uid: raw.id || fallbackUid,
    summary: raw.title || "Untitled Event",
    start: bounds.start,
    end: bounds.end,
    location: raw.location ?? undefined,
    description: raw.notes ?? undefined,
    url: raw.url ?? undefined,
    datetype: raw.allDay ? "date" : "date-time",
  } as unknown as VEvent;
}
