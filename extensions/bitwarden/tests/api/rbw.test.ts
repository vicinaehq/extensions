import { describe, it, expect } from "vitest";
import { RbwCli } from "../../src/api/rbw";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Build a tiny shell script that echoes its argv and selected env to stdout, then exits.
function fakeRbw(): string {
  const dir = mkdtempSync(join(tmpdir(), "fake-rbw-"));
  const path = join(dir, "rbw");
  writeFileSync(path, `#!/bin/sh
echo "ARGS:$*"
echo "SSL:$SSL_CERT_FILE"
echo "PIN:$RBW_PINENTRY_VALUE"
exit 0
`);
  chmodSync(path, 0o755);
  return path;
}

describe("RbwCli", () => {
  it("invokes rbw with args and returns stdout", async () => {
    const cli = new RbwCli({ cliPath: fakeRbw() });
    const out = await cli.text(["list", "--raw"]);
    expect(out).toContain("ARGS:list --raw");
  });

  it("injects SSL_CERT_FILE when serverCertsPath set", async () => {
    const cli = new RbwCli({ cliPath: fakeRbw(), serverCertsPath: "/etc/foo.pem" });
    const out = await cli.text(["status"]);
    expect(out).toContain("SSL:/etc/foo.pem");
  });

  it("withEnv merges env on the new instance only", async () => {
    const base = new RbwCli({ cliPath: fakeRbw() });
    const env = base.withEnv({ RBW_PINENTRY_VALUE: "topsecret" });
    expect((await env.text(["unlock"]))).toContain("PIN:topsecret");
    expect((await base.text(["unlock"]))).toContain("PIN:\n");
  });

  it("readJson parses raw output", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fake-rbw-"));
    const path = join(dir, "rbw");
    writeFileSync(path, `#!/bin/sh\necho '{"hello":"world"}'\n`);
    chmodSync(path, 0o755);
    const cli = new RbwCli({ cliPath: path });
    expect(await cli.readJson(["list", "--raw"])).toEqual({ hello: "world" });
  });

  it("rejects with classified error on non-zero exit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fake-rbw-"));
    const path = join(dir, "rbw");
    writeFileSync(path, `#!/bin/sh\necho "Error: failed to find entry: x" >&2\nexit 1\n`);
    chmodSync(path, 0o755);
    const cli = new RbwCli({ cliPath: path });
    const { ItemNotFound } = await import("../../src/api/errors");
    await expect(cli.text(["get", "x"])).rejects.toBeInstanceOf(ItemNotFound);
  });

  it("throws BwNotFound on ENOENT", async () => {
    const cli = new RbwCli({ cliPath: "/nonexistent/rbw-binary-xyz" });
    const { BwNotFound } = await import("../../src/api/errors");
    await expect(cli.text(["status"])).rejects.toBeInstanceOf(BwNotFound);
  });
});
