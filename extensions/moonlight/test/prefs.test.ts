import { describe, expect, it } from "vitest";
import {
	chooseConfigPath,
	expandHome,
	parseTimeoutSeconds,
} from "../src/lib/prefs";

const HOME = "/home/user";
const NATIVE =
	"/home/user/.config/Moonlight Game Streaming Project/Moonlight.conf";
const FLATPAK =
	"/home/user/.var/app/com.moonlight_stream.Moonlight/config/Moonlight Game Streaming Project/Moonlight.conf";

describe("expandHome", () => {
	it("expands a leading ~", () => {
		expect(expandHome("~", HOME)).toBe(HOME);
		expect(expandHome("~/conf/Moonlight.conf", HOME)).toBe(
			"/home/user/conf/Moonlight.conf",
		);
		expect(expandHome("  ~/a  ", "/home/user/")).toBe("/home/user/a");
	});

	it("leaves other paths alone", () => {
		expect(expandHome("/etc/Moonlight.conf", HOME)).toBe("/etc/Moonlight.conf");
		expect(expandHome("~other/x", HOME)).toBe("~other/x");
		expect(expandHome("a/~/b", HOME)).toBe("a/~/b");
	});
});

describe("chooseConfigPath", () => {
	const existsOnly =
		(...files: string[]) =>
		(f: string) =>
			files.includes(f);

	it("auto-detects native first, then Flatpak", () => {
		expect(
			chooseConfigPath(
				"",
				[NATIVE, FLATPAK],
				existsOnly(NATIVE, FLATPAK),
				HOME,
			),
		).toEqual({
			path: NATIVE,
			explicit: false,
		});
		expect(
			chooseConfigPath(undefined, [NATIVE, FLATPAK], existsOnly(FLATPAK), HOME),
		).toEqual({
			path: FLATPAK,
			explicit: false,
		});
		expect(
			chooseConfigPath("   ", [NATIVE, FLATPAK], existsOnly(), HOME),
		).toEqual({
			path: undefined,
			explicit: false,
		});
	});

	it("uses only the configured path, even if it is missing", () => {
		expect(
			chooseConfigPath("~/custom.conf", [NATIVE], existsOnly(NATIVE), HOME),
		).toEqual({
			path: "/home/user/custom.conf",
			explicit: true,
		});
		expect(
			chooseConfigPath("/missing.conf", [NATIVE], existsOnly(NATIVE), HOME),
		).toEqual({
			path: "/missing.conf",
			explicit: true,
		});
	});
});

describe("parseTimeoutSeconds", () => {
	it("defaults to 3 s when empty", () => {
		expect(parseTimeoutSeconds(undefined)).toEqual({ ms: 3000 });
		expect(parseTimeoutSeconds("")).toEqual({ ms: 3000 });
		expect(parseTimeoutSeconds("  ")).toEqual({ ms: 3000 });
	});

	it("accepts integers and decimals", () => {
		expect(parseTimeoutSeconds("5")).toEqual({ ms: 5000 });
		expect(parseTimeoutSeconds("1.5")).toEqual({ ms: 1500 });
		expect(parseTimeoutSeconds(" 2.25 ")).toEqual({ ms: 2250 });
		expect(parseTimeoutSeconds(".75")).toEqual({ ms: 750 });
	});

	it("clamps to 0.5-30 s", () => {
		expect(parseTimeoutSeconds("0.1")).toEqual({ ms: 500 });
		expect(parseTimeoutSeconds("120")).toEqual({ ms: 30000 });
		expect(parseTimeoutSeconds("30")).toEqual({ ms: 30000 });
		expect(parseTimeoutSeconds("0.5")).toEqual({ ms: 500 });
	});

	it("falls back to 3 s with an error on invalid input", () => {
		for (const bad of ["abc", "0", "-1", "1,5", "1e3", "3s", "Infinity", "."]) {
			const result = parseTimeoutSeconds(bad);
			expect(result.ms).toBe(3000);
			expect(result.error).toMatch(/positive number/);
		}
	});
});
