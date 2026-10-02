import { describe, it, expect } from "vitest";
import { nextLoadErrorKey, shouldToastLoadError } from "./toastLoadError";
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

describe("shouldToastLoadError", () => {
  // Regression: a hook that only assigns the ref when `key !== null` never
  // re-arms on success and silently swallows a re-emerging identical error.

  it("toasts on the first failure and returns the new key", () => {
    const r = shouldToastLoadError(null, fail(err()));
    expect(r).toEqual({ key: "/tmp/calendars.json|parse", shouldToast: true });
  });

  it("does not toast on a repeated identical failure but keeps the same key", () => {
    const r = shouldToastLoadError("/tmp/calendars.json|parse", fail(err()));
    expect(r).toEqual({ key: "/tmp/calendars.json|parse", shouldToast: false });
  });

  it("re-arms on a successful read (returns null, no toast)", () => {
    const r = shouldToastLoadError("/tmp/calendars.json|parse", ok);
    expect(r).toEqual({ key: null, shouldToast: false });
  });

  it("toasts again when the same error reappears after recovery", () => {
    // After the recovery step above, prev is null. The re-emerging error
    // must produce a fresh toast.
    const r = shouldToastLoadError(null, fail(err()));
    expect(r).toEqual({ key: "/tmp/calendars.json|parse", shouldToast: true });
  });

  it("does not toast a different reason when the key still matches", () => {
    // nextLoadErrorKey returns a different key for a different reason, so
    // shouldToastLoadError must surface that as a new toast.
    const r = shouldToastLoadError(
      "/tmp/calendars.json|parse",
      fail(err({ reason: "shape" })),
    );
    expect(r).toEqual({ key: "/tmp/calendars.json|shape", shouldToast: true });
  });
});
