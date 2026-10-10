import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installVicinaeStubs } from "./setup";

const stubs = installVicinaeStubs();

const { loadConfig } = await import("../src/lib/config");
const { resolveOpenCodeBinary, openTerminalAt, openSessionInTUI, openTUI } = await import("../src/lib/launch");

const tempDir = mkdtempSync(join(tmpdir(), "opencode-config-"));
afterEach(() => {
  stubs.preferences = {};
});
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe("config", () => {
  test("defaults are auto-detected and nothing is required", () => {
    const config = loadConfig();
    expect(config.serverUrl).toBeUndefined();
    expect(config.serverUsername).toBe("opencode");
    expect(config.serverPassword).toBeUndefined();
    expect(config.openCodePath).toBeUndefined();
  });

  test("configured values are normalized", () => {
    stubs.preferences = {
      serverUrl: "  http://127.0.0.1:49374  ",
      serverUsername: "  alice  ",
      serverPassword: "  secret  ",
      openCodePath: " /usr/local/bin/opencode ",
    };
    const config = loadConfig();
    expect(config.serverUrl).toBe("http://127.0.0.1:49374");
    expect(config.serverUsername).toBe("alice");
    expect(config.serverPassword).toBe("secret");
    expect(config.openCodePath).toBe("/usr/local/bin/opencode");
  });
});

describe("launch", () => {
  test("a configured V2 binary is verified and used", async () => {
    const fake = join(tempDir, "fake-opencode-v2");
    writeFileSync(fake, "#!/bin/sh\necho 'opencode v2.0.8'\n");
    chmodSync(fake, 0o755);
    const binary = await resolveOpenCodeBinary(fake);
    expect(binary).toBe(fake);
  });

  test("a non-V2 configured binary is rejected", async () => {
    const fake = join(tempDir, "fake-opencode-v1");
    writeFileSync(fake, "#!/bin/sh\necho '1.18.31'\n");
    chmodSync(fake, 0o755);
    try {
      await resolveOpenCodeBinary(fake);
      throw new Error("expected resolveOpenCodeBinary to reject");
    } catch (error) {
      expect((error as Error).message).toBe("The configured OpenCode executable is not OpenCode V2.");
    }
  });

  test("resume command quotes every argument", async () => {
    stubs.spawnedCommands = [];
    const { buildResumeCommand } = await import("../src/lib/launch");
    const command = buildResumeCommand("ses_x'1", "/tmp/some dir", "/usr/local/bin/opencode");
    expect(command).toContain("cd -- '/tmp/some dir'");
    expect(command).toContain("'/usr/local/bin/opencode' --session 'ses_x'\"'\"'1'");
  });

  test("a terminal opens at the directory with safe quoting", async () => {
    stubs.spawnedCommands = [];
    await openTerminalAt("/tmp/some dir with 'quotes'");
    expect(stubs.spawnedCommands).toHaveLength(1);
    const command = stubs.spawnedCommands[0]?.join(" ") ?? "";
    expect(command).toContain("cd -- ");
    expect(command).toContain("'\"'\"'"); // the quote is escaped, not injected
  });

  test("resume opens the TUI at the session", async () => {
    stubs.spawnedCommands = [];
    await openSessionInTUI("/usr/bin/opencode", "ses_abc", "/tmp/project");
    expect(stubs.spawnedCommands[0]).toEqual(["/usr/bin/opencode", "--session", "ses_abc", "/tmp/project"]);
  });

  test("open TUI works without a directory", async () => {
    stubs.spawnedCommands = [];
    await openTUI("/usr/bin/opencode");
    expect(stubs.spawnedCommands[0]).toEqual(["/usr/bin/opencode"]);
  });
});

