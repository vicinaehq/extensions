/** Static Raycast-compatibility checks. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

/**
 * Host shim for the aliased runtime import below.
 *
 * `@raycast/api` resolves to `@vicinae/api` in tests (see `vite.config.ts`),
 * which reads `globalThis.vicinae` at import time. Set before importing.
 */
type ShimmedGlobals = typeof globalThis & {
  vicinae?: { environ: { supportPath: string }; preferences: Record<string, unknown> };
};
(globalThis as ShimmedGlobals).vicinae = { environ: { supportPath: "" }, preferences: {} };

/** Shipped sources: everything under `src/` except test files. */
function shippedSources(): string[] {
  return readdirSync(srcDir)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\./.test(file))
    .map((file) => join(srcDir, file));
}

/** Type-only members, used in type position (value use fails typecheck). */
const TYPE_ONLY = new Set(["ColorLike"]);

/** `Icon.*` / `Color.*` / `Common.*` members referenced by shipped sources. */
function usedMembers(): { icons: string[]; colors: string[]; commons: string[] } {
  const sources = shippedSources().map((file) => readFileSync(file, "utf8"));
  const collect = (pattern: RegExp): string[] => {
    const names = new Set<string>();
    for (const content of sources) {
      for (const match of content.matchAll(pattern)) {
        if (match[1]) names.add(match[1]);
      }
    }
    return [...names].sort();
  };
  return {
    icons: collect(/\bIcon\.(\w+)/g),
    colors: collect(/\bColor\.(\w+)/g).filter((name) => !TYPE_ONLY.has(name)),
    commons: collect(/\bCommon\.(\w+)/g),
  };
}

describe("raycast compatibility", () => {
  it("imports the API only from @raycast/api", () => {
    for (const file of shippedSources()) {
      expect(readFileSync(file, "utf8")).not.toMatch(/from ["']@vicinae\/api["']/);
    }
    const importers = shippedSources().filter((file) =>
      /from ["']@raycast\/api["']/.test(readFileSync(file, "utf8")),
    );
    expect(importers.length).toBeGreaterThan(0);
  });

  it("uses no Vicinae-only API members", () => {
    for (const file of shippedSources()) {
      expect(readFileSync(file, "utf8")).not.toContain("Globe01");
    }
  });

  it("resolves every used API member on both hosts", async () => {
    const { icons, colors, commons } = usedMembers();
    expect(icons.length).toBeGreaterThan(0);

    // Vicinae side: members resolve on the aliased runtime import.
    const api = await import("@raycast/api");
    for (const name of icons) expect(api.Icon).toHaveProperty(name);
    for (const name of colors) expect(api.Color).toHaveProperty(name);
    for (const name of commons) expect(api.Keyboard.Shortcut.Common).toHaveProperty(name);

    // Raycast side: members are declared in @raycast/api types.
    const raycastTypes = readFileSync(
      join(root, "node_modules", "@raycast/api", "types", "index.d.ts"),
      "utf8",
    );
    for (const name of [...icons, ...colors, ...commons]) {
      expect(new RegExp(`^\\s+${name}\\s*[:=]`, "m").test(raycastTypes)).toBe(true);
    }
  });

  it("declares a Raycast-valid manifest", () => {
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      icon?: string;
      platforms?: string[];
      dependencies?: Record<string, string>;
    };
    // Both schemas default absent `platforms` to all platforms, and their
    // enums disagree on Linux (Vicinae allows it, Raycast forbids it), so the
    // key stays absent: the extension runs everywhere its hosts do.
    expect(manifest.platforms).toBeUndefined();
    if (!manifest.icon) throw new Error("Expected manifest icon to be set");
    expect(manifest.icon).toMatch(/\.png$/);
    expect(existsSync(join(root, "assets", manifest.icon))).toBe(true);
    expect(manifest.dependencies?.["@raycast/api"]).toBeTruthy();
  });
});
