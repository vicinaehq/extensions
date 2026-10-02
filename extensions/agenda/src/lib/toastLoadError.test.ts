import { describe, it, expect } from "vitest";
import { nextLoadErrorKey } from "./toastLoadError";
import type { CalendarsLoadError, LoadCalendarsResult } from "./calendar";

const ok: LoadCalendarsResult = { ok: true, calendars: [] };

const err = (overrides: Partial<CalendarsLoadError> = {}): CalendarsLoadError => ({
  filePath: "/tmp/calendars.json",
  reason: "parse",
  message: "boom",
  backupPath: null,
  ...overrides,
});

const fail = (e: CalendarsLoadError): LoadCalendarsResult => ({
  ok: false,
  error: e,
});

describe("nextLoadErrorKey", () => {
  it("returns a new key on the first failure (toast needed)", () => {
    expect(nextLoadErrorKey(null, fail(err()))).toBe("/tmp/calendars.json|parse");
  });

  it("returns the same key for a repeated identical failure (dedup, no toast)", () => {
    const k = "/tmp/calendars.json|parse";
    expect(nextLoadErrorKey(k, fail(err()))).toBe(k);
  });

  it("re-arms on success: a successful read clears the key", () => {
    expect(nextLoadErrorKey("/tmp/calendars.json|parse", ok)).toBeNull();
  });

  it("toasts a different reason after a prior failure", () => {
    expect(
      nextLoadErrorKey("/tmp/calendars.json|parse", fail(err({ reason: "shape" }))),
    ).toBe("/tmp/calendars.json|shape");
  });

  it("toasts a different file after a prior failure", () => {
    expect(
      nextLoadErrorKey(
        "/tmp/calendars.json|parse",
        fail(err({ filePath: "/var/cal.json" })),
      ),
    ).toBe("/var/cal.json|parse");
  });
});
