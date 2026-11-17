import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseServerUrl, resolveEndpoint } from "../src/lib/opencode/discovery";
import { fakeFetch, jsonResponse, serverInfoFixture } from "./helpers";

const tempDir = mkdtempSync(join(tmpdir(), "opencode-discovery-"));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function registrationFile(overrides: Record<string, unknown> = {}): string {
  const file = join(tempDir, `service-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      id: "test-service",
      version: "2.0.8",
      url: "http://127.0.0.1:45999",
      pid: 1234,
      password: "secret-password",
      ...overrides,
    }),
  );
  return file;
}

describe("server URL validation", () => {
  test("accepts http and https URLs and strips paths", () => {
    expect(parseServerUrl("http://127.0.0.1:49374")).toBe("http://127.0.0.1:49374");
    expect(parseServerUrl("https://opencode.example.com/some/path?x=1")).toBe("https://opencode.example.com");
    expect(parseServerUrl("  http://localhost:4096  ")).toBe("http://localhost:4096");
  });

  test("rejects non-http URLs, bare hosts, and embedded credentials", () => {
    expect(parseServerUrl("not-a-url")).toBeNull();
    expect(parseServerUrl("ftp://example.com")).toBeNull();
    expect(parseServerUrl("localhost:4096")).toBeNull();
    expect(parseServerUrl("http://user:pass@example.com")).toBeNull();
  });
});

describe("discovery", () => {
  test("configured server is used directly, without credentials by default", async () => {
    const endpoint = await resolveEndpoint({ serverUrl: "http://127.0.0.1:49374/" });
    expect(endpoint?.url).toBe("http://127.0.0.1:49374");
    expect(endpoint?.headers).toBeUndefined();
  });

  test("configured server with a password sends basic auth", async () => {
    const endpoint = await resolveEndpoint({
      serverUrl: "http://127.0.0.1:49374",
      serverUsername: "alice",
      serverPassword: "wonderland",
    });
    expect(endpoint?.headers?.["authorization"]).toBe(`Basic ${Buffer.from("alice:wonderland").toString("base64")}`);
  });

  test("configured server without a username falls back to opencode", async () => {
    const endpoint = await resolveEndpoint({
      serverUrl: "http://127.0.0.1:49374",
      serverPassword: "secret",
    });
    expect(endpoint?.headers?.["authorization"]).toBe(`Basic ${Buffer.from("opencode:secret").toString("base64")}`);
  });

  test("remote http with a password is rejected", async () => {
    try {
      await resolveEndpoint({ serverUrl: "http://192.168.1.10:4096", serverPassword: "secret" });
      throw new Error("expected resolveEndpoint to reject");
    } catch (error) {
      expect((error as Error).message).toBe("Password auth needs HTTPS on remote servers.");
    }
  });

  test("a 127.* hostname that is not a loopback address is rejected", async () => {
    // 127.attacker.example resolves outside the machine, so the password
    // must not travel over plaintext HTTP.
    try {
      await resolveEndpoint({ serverUrl: "http://127.attacker.example:4096", serverPassword: "secret" });
      throw new Error("expected resolveEndpoint to reject");
    } catch (error) {
      expect((error as Error).message).toBe("Password auth needs HTTPS on remote servers.");
    }
  });

  test("remote https with a password sends basic auth", async () => {
    const endpoint = await resolveEndpoint({
      serverUrl: "https://opencode.example.com",
      serverUsername: "alice",
      serverPassword: "wonderland",
    });
    expect(endpoint?.headers?.["authorization"]).toBe(`Basic ${Buffer.from("alice:wonderland").toString("base64")}`);
  });

  test("remote http without a password is allowed", async () => {
    const endpoint = await resolveEndpoint({ serverUrl: "http://192.168.1.10:4096" });
    expect(endpoint?.url).toBe("http://192.168.1.10:4096");
    expect(endpoint?.headers).toBeUndefined();
  });

  test("invalid endpoint is rejected", async () => {
    try {
      await resolveEndpoint({ serverUrl: "not-a-url" });
      throw new Error("expected resolveEndpoint to reject");
    } catch (error) {
      expect((error as Error).message).toBe("The configured OpenCode server URL is invalid.");
    }
  });

  test("detected server comes from the official discovery with auth", async () => {
    // The registration file points at a fake healthy server; the health check
    // is mocked so the test is hermetic.
    const file = registrationFile();
    const { fetch } = fakeFetch(({ url }) =>
      url.endsWith("/api/info") ? jsonResponse(serverInfoFixture()) : jsonResponse({}, 404),
    );
    const original = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
      const endpoint = await resolveEndpoint({}, { file });
      expect(endpoint?.url).toBe("http://127.0.0.1:45999");
      expect(endpoint?.headers?.["authorization"]).toContain("Basic ");
    } finally {
      globalThis.fetch = original;
    }
  });

  test("unavailable server resolves to null", async () => {
    // A registration whose URL nobody answers: discovery yields nothing.
    const file = registrationFile({ url: "http://127.0.0.1:45998" });
    const { fetch } = fakeFetch(() => {
      throw new TypeError("Unable to connect");
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
      const endpoint = await resolveEndpoint({}, { file });
      expect(endpoint).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });

  test("missing registration file resolves to null", async () => {
    const endpoint = await resolveEndpoint({}, { file: join(tempDir, "does-not-exist.json") });
    expect(endpoint).toBeNull();
  });
});
