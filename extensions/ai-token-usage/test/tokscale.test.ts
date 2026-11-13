import { expect, test } from "bun:test";
import { isAtLeast, parseVersion, statusFromVersionOutput } from "../src/lib/tokscale";

test("parseVersion reads tokscale --version output", () => {
	expect(parseVersion("tokscale 4.22.0\n")).toBe("4.22.0");
	expect(parseVersion("garbage")).toBeNull();
});

test("isAtLeast compares numerically, not as strings", () => {
	expect(isAtLeast("4.22.0", "4.22.0")).toBe(true);
	expect(isAtLeast("4.100.0", "4.22.0")).toBe(true);
	expect(isAtLeast("5.0.0", "4.22.0")).toBe(true);
	expect(isAtLeast("4.21.9", "4.22.0")).toBe(false);
	expect(isAtLeast("3.99.99", "4.22.0")).toBe(false);
});

test("statusFromVersionOutput classifies output", () => {
	expect(statusFromVersionOutput("tokscale 4.22.0")).toEqual({ kind: "ok", version: "4.22.0" });
	expect(statusFromVersionOutput("tokscale 4.21.0")).toEqual({ kind: "outdated", version: "4.21.0" });
	expect(statusFromVersionOutput("oops").kind).toBe("unknown-version");
});
