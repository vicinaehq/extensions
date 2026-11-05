import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { environment, Cache } from "@vicinae/api";
import { getCalendars, setCalendars, __resetCalendarCacheForTests } from "./calendar";

const dir = environment.supportPath;
const file = `${dir}/calendars.json`;

const sample = [
  { url: "https://example.com/a.ics", name: "A", color: "blue" },
  { url: "https://example.com/b.ics", name: "B", color: "red" },
];

const clean = () => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (
      name === "calendars.json" ||
      name === "calendars.json.tmp" ||
      name.startsWith("calendars.json.corrupt-")
    ) {
      unlinkSync(`${dir}/${name}`);
    }
  }
};

const expectOk = (r: ReturnType<typeof getCalendars>): typeof sample => {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("expected ok: true");
  return r.calendars;
};

const expectErr = (
  r: ReturnType<typeof getCalendars>,
  reason: "parse" | "shape",
): void => {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("expected ok: false");
  expect(r.error.reason).toBe(reason);
};

describe("calendars store", () => {
  beforeEach(() => {
    clean();
    __resetCalendarCacheForTests();
  });
  afterEach(clean);

  it("returns ok with [] when no file exists and no legacy cache data", () => {
    expect(expectOk(getCalendars())).toEqual([]);
  });

  it("round-trips calendars through the JSON file with a version field", () => {
    setCalendars(sample as any);
    expect(expectOk(getCalendars())).toEqual(sample);

    const onDisk = JSON.parse(readFileSync(file, "utf-8"));
    expect(onDisk.version).toBe(1);
    expect(onDisk.calendars).toEqual(sample);
  });

  it("migrates calendars from the legacy Cache store on first read, then persists to file", () => {
    const getSpy = vi
      .spyOn(Cache.prototype, "get")
      .mockReturnValue(JSON.stringify(sample));

    expect(expectOk(getCalendars())).toEqual(sample);
    expect(existsSync(file)).toBe(true);

    // Subsequent reads come from the file (or the mtime cache), independent of the legacy cache.
    getSpy.mockReturnValue(undefined);
    expect(expectOk(getCalendars())).toEqual(sample);
    getSpy.mockRestore();
  });

  it("moves a corrupt calendars.json aside and returns ok: false with reason 'parse'", () => {
    setCalendars(sample as any);
    writeFileSync(file, "{ not valid json");

    expectErr(getCalendars(), "parse");
    const leftovers = readdirSync(dir).filter((f) =>
      f.startsWith("calendars.json.corrupt-"),
    );
    expect(leftovers.length).toBe(1);
    // clean() will sweep the corrupt file out too, so nothing leaks between runs.
  });

  it("returns ok: false with reason 'shape' when calendars is not an array", () => {
    writeFileSync(file, JSON.stringify({ version: 1, calendars: "not-an-array" }));
    const r = getCalendars();
    expectErr(r, "shape");
    if (!r.ok) expect(r.error.backupPath).toBeNull();
  });

  it("invalidates the read cache when setCalendars writes a new file", () => {
    setCalendars(sample as any);
    expect(expectOk(getCalendars())).toEqual(sample);

    const updated = [
      { url: "https://example.com/c.ics", name: "C", color: "green" },
    ];
    setCalendars(updated as any);
    expect(expectOk(getCalendars())).toEqual(updated);
  });
});
