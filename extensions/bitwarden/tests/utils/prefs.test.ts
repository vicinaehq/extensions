import { describe, it, expect, vi } from "vitest";
import { statSync, readFileSync } from "node:fs";

vi.mock("@vicinae/api", () => ({ getPreferenceValues: vi.fn(() => ({})) }));
import { resolveCliPath, resolvePinentryShim, resolveEditorShim } from "../../src/utils/prefs";

describe("resolveCliPath", () => {
  it("defaults to rbw when pref is empty", () => {
    expect(resolveCliPath({ cliPath: "" } as never)).toBe("rbw");
  });
  it("honors a custom path", () => {
    expect(resolveCliPath({ cliPath: "/opt/rbw" } as never)).toBe("/opt/rbw");
  });
});

describe("resolveShim", () => {
  it("materializes pinentry shim under ~/.cache/vicinae-bw as executable", () => {
    const p = resolvePinentryShim();
    expect(p.endsWith("/vicinae-bw/shims/pinentry-vicinae")).toBe(true);
    expect((statSync(p).mode & 0o111) !== 0).toBe(true);
    expect(readFileSync(p, "utf8")).toContain("Assuan-protocol shim");
  });
  it("materializes editor shim under ~/.cache/vicinae-bw as executable", () => {
    const p = resolveEditorShim();
    expect(p.endsWith("/vicinae-bw/shims/editor-vicinae")).toBe(true);
    expect((statSync(p).mode & 0o111) !== 0).toBe(true);
    expect(readFileSync(p, "utf8")).toContain("EDITOR replacement");
  });
});
