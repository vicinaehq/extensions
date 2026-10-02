import { showToast, Toast } from "@vicinae/api";
import type { CalendarsLoadError, LoadCalendarsResult } from "./calendar";

export const toastLoadError = (err: CalendarsLoadError): void => {
  const detail = err.backupPath
    ? `Moved to ${err.backupPath}. Reason: ${err.message}`
    : `Reason: ${err.message}`;
  showToast({
    style: Toast.Style.Failure,
    title: "Couldn't read calendars.json",
    message: `${err.filePath}. ${detail}`,
  });
};

// Decide whether a load error should be toasted given the previous dedup key.
// Returns the next dedup key, or null on success to re-arm.
//   nextLoadErrorKey(null,        fail(parse)) -> "/x|parse"   (toast)
//   nextLoadErrorKey("/x|parse",  fail(parse)) -> "/x|parse"   (dedup, no toast)
//   nextLoadErrorKey("/x|parse",  ok)          -> null         (re-arm)
export const nextLoadErrorKey = (
  prev: string | null,
  result: LoadCalendarsResult,
): string | null => {
  if (result.ok) return null;
  const key = `${result.error.filePath}|${result.error.reason}`;
  return prev === key ? prev : key;
};
