import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { environment, Cache } from "@vicinae/api";
import { getCalendars, setCalendars, consumeLastLoadError, __resetLoadErrorStateForTests } from "./calendar";

const dir = environment.supportPath;
const file = `${dir}/calendars.json`;

const sample = [
  { url: "https://example.com/a.ics", name: "A", color: "blue" },
  { url: "https://example.com/b.ics", name: "B", color: "red" },
];

const clean = () => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "calendars.json" || name.startsWith("calendars.json.corrupt-")) {
      unlinkSync(`${dir}/${name}`);
    }
  }
};

describe("calendars store", () => {
  beforeEach(() => {
    clean();
    __resetLoadErrorStateForTests();
  });
  afterEach(clean);

  it("returns [] when no file exists and no legacy cache data", () => {
    expect(getCalendars()).toEqual([]);
  });

  it("round-trips calendars through the JSON file with a version field", () => {
    setCalendars(sample as any);
    expect(getCalendars()).toEqual(sample);

    const onDisk = JSON.parse(readFileSync(file, "utf-8"));
    expect(onDisk.version).toBe(1);
    expect(onDisk.calendars).toEqual(sample);
  });

  it("migrates calendars from the legacy Cache store on first read, then persists to file", () => {
    const getSpy = vi
      .spyOn(Cache.prototype, "get")
      .mockReturnValue(JSON.stringify(sample));

    expect(getCalendars()).toEqual(sample);
    expect(existsSync(file)).toBe(true);

    // Subsequent reads come from the file, independent of the legacy cache.
    getSpy.mockReturnValue(undefined);
    expect(getCalendars()).toEqual(sample);
    getSpy.mockRestore();
  });

  it("moves a corrupt calendars.json aside and returns [] instead of overwriting silently", () => {
    setCalendars(sample as any);
    writeFileSync(file, "{ not valid json");

    expect(getCalendars()).toEqual([]);
    const leftovers = readdirSync(dir).filter((f) =>
      f.startsWith("calendars.json.corrupt-"),
    );
    expect(leftovers.length).toBe(1);
    // clean() will sweep the corrupt file out too, so nothing leaks between runs.
  });

  it("reports a corrupt file once, then suppresses repeated identical failures", () => {
    writeFileSync(file, "{ not valid json");
    expect(getCalendars()).toEqual([]);
    const first = consumeLastLoadError();
    expect(first?.reason).toBe("parse");

    // Same file, same parse failure on the next read should not re-report.
    expect(getCalendars()).toEqual([]);
    expect(consumeLastLoadError()).toBeNull();

    // A successful read re-arms the reporter.
    setCalendars(sample as any);
    expect(getCalendars()).toEqual(sample);
    expect(consumeLastLoadError()).toBeNull();
  });

  it("reports a new shape error after a successful read clears the previous dedup key", () => {
    setCalendars(sample as any);
    expect(consumeLastLoadError()).toBeNull();

    writeFileSync(file, JSON.stringify({ version: 1, calendars: "not-an-array" }));
    expect(getCalendars()).toEqual([]);
    expect(consumeLastLoadError()?.reason).toBe("shape");
  });
});
