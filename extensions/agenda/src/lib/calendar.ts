import { Cache, environment } from "@vicinae/api";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Calendar } from "./types";
import { isLocalPath, expandPath } from "./localPath";

const CALENDARS_FILE = "calendars.json";
const LEGACY_CACHE_KEY = "calendars";
const SCHEMA_VERSION = 1;

interface CalendarsFile {
  version: number;
  calendars: Calendar[];
}

const calendarsFilePath = () => join(environment.supportPath, CALENDARS_FILE);

export interface CalendarsLoadError {
  filePath: string;
  reason: "parse" | "shape";
  message: string;
  backupPath: string | null;
}

export type LoadCalendarsResult =
  | { ok: true; calendars: Calendar[] }
  | { ok: false; error: CalendarsLoadError };

// mtime+size cache for getCalendars. Invalidated when the file changes on
// disk and explicitly inside writeCalendars.
let lastReadKey: string | null = null;
let lastReadResult: LoadCalendarsResult | null = null;

export const __resetCalendarCacheForTests = (): void => {
  lastReadKey = null;
  lastReadResult = null;
};

// One-shot import from the old LRU Cache store, used before the JSON file existed.
const migrateFromCache = (): Calendar[] => {
  try {
    const raw = new Cache().get(LEGACY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Calendar[];
    }
  } catch (error) {
    console.error("Failed to migrate calendars from Cache:", error);
  }
  return [];
};

const writeCalendars = (calendars: Calendar[]) => {
  const dir = environment.supportPath;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filePath = calendarsFilePath();
  const json = JSON.stringify(
    { version: SCHEMA_VERSION, calendars } satisfies CalendarsFile,
    null,
    2,
  );

  // Atomic write: temp file + rename, so a crash mid-write can't leave a truncated config.
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, json);
  renameSync(tmp, filePath);

  lastReadKey = null;
  lastReadResult = null;
};

export const getCalendars = (): LoadCalendarsResult => {
  const filePath = calendarsFilePath();

  if (existsSync(filePath)) {
    const stat = statSync(filePath);
    const key = `${filePath}|${stat.mtimeMs}|${stat.size}`;
    if (lastReadKey === key && lastReadResult) {
      return lastReadResult;
    }

    let result: LoadCalendarsResult;
    try {
      const data = JSON.parse(readFileSync(filePath, "utf-8")) as CalendarsFile;
      if (data && Array.isArray(data.calendars)) {
        result = { ok: true, calendars: data.calendars };
      } else {
        console.error(`Unexpected calendars.json shape at ${filePath}`);
        result = {
          ok: false,
          error: {
            filePath,
            reason: "shape",
            message: "expected { version, calendars[] }",
            backupPath: null,
          },
        };
      }
    } catch (error) {
      // Preserve the bad file for manual recovery instead of silently overwriting it.
      const backup = `${filePath}.corrupt-${Date.now()}`;
      console.error(
        `Failed to parse ${filePath}, moving to ${backup}:`,
        error,
      );
      let backupPath: string | null = null;
      try {
        renameSync(filePath, backup);
        backupPath = backup;
      } catch {
        // best-effort; fall through to error result
      }
      result = {
        ok: false,
        error: {
          filePath,
          reason: "parse",
          message: error instanceof Error ? error.message : String(error),
          backupPath,
        },
      };
    }
    lastReadKey = key;
    lastReadResult = result;
    return result;
  }

  // First run after upgrade: import from the legacy Cache store once, then persist to file.
  const migrated = migrateFromCache();
  if (migrated.length > 0) writeCalendars(migrated);
  const result: LoadCalendarsResult = { ok: true, calendars: migrated };
  lastReadKey = `${filePath}|missing`;
  lastReadResult = result;
  return result;
};

export const setCalendars = (calendars: Calendar[]) => {
  writeCalendars(calendars);
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
