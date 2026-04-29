import { describe, it, expect, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@vicinae/api", () => ({ getPreferenceValues: vi.fn(() => ({})) }));
import { resolvePinentryShim, resolveEditorShim } from "../../src/utils/prefs";

function runShim(bin: string, env: Record<string, string>, stdin: string, args: string[] = []): Promise<{stdout: string; code: number | null}> {
  return new Promise((res) => {
    const p = spawn(bin, args, { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stdin.on("error", () => { /* shim may close stdin before we write (editor shim exits immediately) */ });
    p.on("close", (code) => res({ stdout: out, code }));
    if (stdin.length > 0) p.stdin.write(stdin);
    p.stdin.end();
  });
}

describe("pinentry-vicinae shim (materialized)", () => {
  it("emits master password on GETPIN", async () => {
    const path = resolvePinentryShim();
    const { stdout, code } = await runShim(path, { RBW_PINENTRY_VALUE: "hunter2" }, "GETPIN\nBYE\n");
    expect(stdout).toMatch(/^OK Pleased to meet you\n/);
    expect(stdout).toContain("D hunter2\n");
    expect(stdout).toContain("OK\n");
    expect(code).toBe(0);
  });

  it("acknowledges unknown commands with OK", async () => {
    const path = resolvePinentryShim();
    const { stdout } = await runShim(path, { RBW_PINENTRY_VALUE: "x" }, "SETDESC something\nBYE\n");
    expect(stdout.match(/(?:^|\n)OK\b/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("percent-encodes %, CR, and LF in the master password", async () => {
    const path = resolvePinentryShim();
    const { stdout } = await runShim(path, { RBW_PINENTRY_VALUE: "p%a\nb\rc" }, "GETPIN\nBYE\n");
    expect(stdout).toContain("D p%25a%0Ab%0Dc\n");
  });
});

describe("editor-vicinae shim (materialized)", () => {
  it("writes RBW_EDITOR_PAYLOAD to argv[1]", async () => {
    const path = resolveEditorShim();
    const dir = mkdtempSync(join(tmpdir(), "editor-shim-"));
    const file = join(dir, "rbw-edit.txt");
    writeFileSync(file, "");
    const { code } = await runShim(path, { RBW_EDITOR_PAYLOAD: "secretpass\n\nthe note body" }, "", [file]);
    expect(code).toBe(0);
    expect(readFileSync(file, "utf8")).toBe("secretpass\n\nthe note body");
  });

  it("writes empty payload when env unset", async () => {
    const path = resolveEditorShim();
    const dir = mkdtempSync(join(tmpdir(), "editor-shim-"));
    const file = join(dir, "rbw-edit.txt");
    writeFileSync(file, "stale");
    const { code } = await runShim(path, {}, "", [file]);
    expect(code).toBe(0);
    expect(readFileSync(file, "utf8")).toBe("");
  });
});
