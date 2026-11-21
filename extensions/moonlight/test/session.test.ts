import { describe, expect, it } from "vitest";
import type { MoonlightApp, MoonlightHost } from "../src/lib/parse";
import {
	buildLaunchCommand,
	decideAppPresentation,
	isExitedState,
	parseProcStatState,
	hostIdentifiers,
	hostStatusSummary,
	localStreamTarget,
	resolveHostSession,
	selectStreamPids,
	visibleApps,
	isStreamProcessForHost,
	parseServerInfo,
	serverInfoUrls,
	splitCmdline,
} from "../src/lib/session";

// Real response from Martins-Mac-mini.local (Sunshine), mac/addresses trimmed.
const BUSY_XML = `<?xml version="1.0" encoding="utf-8"?>
<root status_code="200"><hostname>Martins-Mac-mini.local</hostname><appversion>7.1.431.-1</appversion><GfeVersion>3.23.0.74</GfeVersion><uniqueid>22F27EF2-B21B-272E-5C9F-BFC5B1D978B2</uniqueid><HttpsPort>47984</HttpsPort><ExternalPort>47989</ExternalPort><LocalIP>192.168.0.86</LocalIP><PairStatus>0</PairStatus><currentgame>881448767</currentgame><state>SUNSHINE_SERVER_BUSY</state></root>`;

const FREE_XML = BUSY_XML.replace("881448767", "0").replace(
	"SUNSHINE_SERVER_BUSY",
	"SUNSHINE_SERVER_FREE",
);

const host: MoonlightHost = {
	index: 1,
	name: "Martins-Mac-mini.local",
	localAddress: "192.168.0.86",
	manualAddress: "martins-mac-mini.local",
	remoteAddress: "203.0.113.7",
	localPort: 47989,
	apps: [],
};

const app = (name: string, id: number): MoonlightApp => ({
	name,
	id,
	hdr: false,
	appCollectionGame: false,
	hidden: false,
	directLaunch: false,
});
const desktop = app("Desktop", 881448767);
const steam = app("Steam Big Picture", 1093255277);
const apps = [desktop, steam];

describe("parseServerInfo", () => {
	it("parses a busy Sunshine host", () => {
		expect(parseServerInfo(BUSY_XML)).toEqual({
			state: "busy",
			currentGame: 881448767,
		});
	});

	it("parses a free Sunshine host", () => {
		expect(parseServerInfo(FREE_XML)).toEqual({
			state: "free",
			currentGame: 0,
		});
	});

	it("ignores a sticky currentgame unless the state is _SERVER_BUSY (GeForce Experience)", () => {
		expect(
			parseServerInfo(
				'<root status_code="200"><currentgame>5</currentgame><state>MJOLNIR_STATE_X</state></root>',
			),
		).toEqual({
			state: "free",
			currentGame: 0,
		});
		expect(
			parseServerInfo(
				'<root status_code="200"><currentgame>5</currentgame><state>SUNSHINE_SERVER_FREE</state></root>',
			),
		).toEqual({
			state: "free",
			currentGame: 0,
		});
	});

	it("uses currentgame alone only when there is no <state>", () => {
		expect(
			parseServerInfo(
				'<root status_code="200"><currentgame>5</currentgame></root>',
			),
		).toEqual({
			state: "busy",
			currentGame: 5,
		});
	});

	it("rejects malformed or error responses", () => {
		expect(parseServerInfo("")).toBeUndefined();
		expect(parseServerInfo("<html>Not found</html>")).toBeUndefined();
		expect(
			parseServerInfo('<root status_code="200"><hostname>x</hostname></root>'),
		).toBeUndefined();
		expect(
			parseServerInfo(
				'<root status_code="401" status_message="Unauthorized"></root>',
			),
		).toBeUndefined();
		expect(
			parseServerInfo(
				'<root status_code="200"><currentgame>abc</currentgame></root>',
			),
		).toEqual({
			state: "free",
			currentGame: 0,
		});
	});
});

describe("serverInfoUrls", () => {
	const q = "/serverinfo?uniqueid=0123456789ABCDEF";

	it("tries every stored address, local first", () => {
		expect(serverInfoUrls(host)).toEqual([
			`http://192.168.0.86:47989${q}`,
			`http://martins-mac-mini.local:47989${q}`,
			`http://203.0.113.7:47989${q}`,
			`http://Martins-Mac-mini.local:47989${q}`,
		]);
	});

	it("pairs each address with its own port", () => {
		expect(
			serverInfoUrls({
				index: 4,
				name: "pc",
				localAddress: "192.168.1.5",
				localPort: 47989,
				manualAddress: "pc.tailnet.ts.net",
				manualPort: 48989,
				remoteAddress: "198.51.100.2",
				remotePort: 50000,
				apps: [],
			}),
		).toEqual([
			`http://192.168.1.5:47989${q}`,
			`http://pc.tailnet.ts.net:48989${q}`,
			`http://198.51.100.2:50000${q}`,
			`http://pc:47989${q}`,
		]);
	});

	it("falls back to the hostname and default port", () => {
		expect(serverInfoUrls({ index: 2, name: "box.local", apps: [] })).toEqual([
			`http://box.local:47989${q}`,
		]);
	});

	it("brackets IPv6 addresses and removes duplicates", () => {
		expect(
			serverInfoUrls({
				index: 3,
				name: "fd00::1",
				localAddress: "fd00::1",
				localPort: 1234,
				apps: [],
			}),
		).toEqual([`http://[fd00::1]:1234${q}`]);
	});
});

describe("isStreamProcessForHost", () => {
	const ids = hostIdentifiers(host);

	it("matches a stream process by hostname (real cmdline)", () => {
		const argv = splitCmdline(
			"moonlight\0stream\0Martins-Mac-mini.local\0Desktop\0",
		);
		expect(argv).toEqual([
			"moonlight",
			"stream",
			"Martins-Mac-mini.local",
			"Desktop",
		]);
		expect(isStreamProcessForHost(argv, ids)).toBe(true);
	});

	it("matches by address, absolute path and with flags", () => {
		expect(
			isStreamProcessForHost(
				[
					"/run/current-system/sw/bin/moonlight",
					"stream",
					"--1080",
					"--fps",
					"60",
					"192.168.0.86",
					"Desktop",
				],
				ids,
			),
		).toBe(true);
		expect(
			isStreamProcessForHost(
				[
					"/nix/store/x/bin/.moonlight-wrapped",
					"stream",
					"MARTINS-MAC-MINI.LOCAL",
					"Desktop",
				],
				ids,
			),
		).toBe(true);
	});

	it("ignores other hosts, other subcommands and other programs", () => {
		expect(
			isStreamProcessForHost(
				["moonlight", "stream", "other-host", "Desktop"],
				ids,
			),
		).toBe(false);
		expect(
			isStreamProcessForHost(
				["moonlight", "list", "--csv", "Martins-Mac-mini.local"],
				ids,
			),
		).toBe(false);
		expect(isStreamProcessForHost(["moonlight"], ids)).toBe(false);
		expect(
			isStreamProcessForHost(
				["zsh", "-c", "moonlight stream Martins-Mac-mini.local Desktop"],
				ids,
			),
		).toBe(false);
		expect(isStreamProcessForHost(["vim", "stream", "192.168.0.86"], ids)).toBe(
			false,
		);
		expect(isStreamProcessForHost([], ids)).toBe(false);
	});
});

describe("localStreamTarget", () => {
	const ids = hostIdentifiers(host);
	it("returns the streamed app name", () => {
		expect(
			localStreamTarget(
				["moonlight", "stream", "Martins-Mac-mini.local", "Desktop"],
				ids,
			),
		).toEqual({ appName: "Desktop" });
		expect(
			localStreamTarget(["moonlight", "stream", "192.168.0.86"], ids),
		).toEqual({ appName: undefined });
		expect(
			localStreamTarget(["moonlight", "stream", "other", "Desktop"], ids),
		).toBeUndefined();
	});

	it("only compares the host positional, not the app or flag values", () => {
		const desktopHost = hostIdentifiers({
			index: 5,
			name: "Desktop",
			manualAddress: "60",
			apps: [],
		});
		// App argument equals the other host's name.
		expect(
			localStreamTarget(
				["moonlight", "stream", "gaming-pc", "Desktop"],
				desktopHost,
			),
		).toBeUndefined();
		// Flag value equals the other host's address.
		expect(
			localStreamTarget(
				["moonlight", "stream", "--fps", "60", "gaming-pc", "Steam"],
				desktopHost,
			),
		).toBeUndefined();
		expect(
			localStreamTarget(
				["moonlight", "stream", "--fps", "60", "--1080", "Desktop", "Steam"],
				desktopHost,
			),
		).toEqual({ appName: "Steam" });
		expect(
			localStreamTarget(
				["moonlight", "stream", "--display-mode=windowed", "Desktop", "Steam"],
				desktopHost,
			),
		).toEqual({ appName: "Steam" });
	});
});

describe("selectStreamPids", () => {
	const ids = hostIdentifiers(host);
	const procs = [
		{
			pid: 100,
			argv: ["moonlight", "stream", "Martins-Mac-mini.local", "Desktop"],
		},
		{
			pid: 101,
			argv: [
				"/usr/bin/moonlight",
				"stream",
				"--1080",
				"192.168.0.86",
				"Steam Big Picture",
			],
		},
		{ pid: 102, argv: ["moonlight", "stream", "other-host", "Desktop"] },
		{ pid: 103, argv: ["moonlight"] },
		{
			pid: 104,
			argv: ["moonlight", "list", "--csv", "Martins-Mac-mini.local"],
		},
		{
			pid: 105,
			argv: ["zsh", "-c", "moonlight stream Martins-Mac-mini.local Desktop"],
		},
		{
			pid: 1,
			argv: ["moonlight", "stream", "Martins-Mac-mini.local", "Desktop"],
		},
		{
			pid: 106,
			argv: ["moonlight", "stream", "Martins-Mac-mini.local", "Desktop"],
		},
	];

	it("selects only stream processes for this host, never self or init", () => {
		expect(selectStreamPids(procs, ids, 106)).toEqual([100, 101]);
		expect(selectStreamPids(procs, ids)).toEqual([100, 101, 106]);
	});

	it("selects nothing when no stream matches", () => {
		expect(selectStreamPids(procs, ["nope"])).toEqual([]);
		expect(selectStreamPids([], ids)).toEqual([]);
	});
});

describe("visibleApps", () => {
	const hiddenSteam = { ...steam, hidden: true };
	const list = [desktop, hiddenSteam];

	it("omits hidden apps by default", () => {
		expect(visibleApps(list, false)).toEqual([desktop]);
	});

	it("shows hidden apps when enabled", () => {
		expect(visibleApps(list, true)).toEqual(list);
	});

	it("keeps a hidden app while it is running", () => {
		expect(visibleApps(list, false, hiddenSteam.id)).toEqual(list);
	});
});

describe("resolveHostSession / hostStatusSummary", () => {
	const busyDesktop = { state: "busy" as const, currentGame: desktop.id };

	it("is free without server or local activity", () => {
		const s = resolveHostSession(
			apps,
			{ state: "free", currentGame: 0 },
			undefined,
		);
		expect(s).toEqual({
			runningAppId: undefined,
			runningAppName: undefined,
			streamingHere: false,
			busy: false,
		});
		expect(hostStatusSummary(s)).toBeUndefined();
		expect(resolveHostSession(apps, undefined, undefined).busy).toBe(false);
	});

	it("reports a busy host from serverinfo", () => {
		const s = resolveHostSession(apps, busyDesktop, undefined);
		expect(s).toMatchObject({
			runningAppId: desktop.id,
			runningAppName: "Desktop",
			busy: true,
			streamingHere: false,
		});
		expect(hostStatusSummary(s)).toBe("busy · Desktop running");
	});

	it("reports a local stream, using the cmdline app when serverinfo is unknown", () => {
		expect(
			hostStatusSummary(
				resolveHostSession(apps, busyDesktop, { appName: "Desktop" }),
			),
		).toBe("streaming Desktop on this PC");
		const s = resolveHostSession(apps, undefined, {
			appName: "steam big picture",
		});
		expect(s).toMatchObject({
			runningAppId: steam.id,
			runningAppName: "Steam Big Picture",
			busy: true,
			streamingHere: true,
		});
		expect(hostStatusSummary(resolveHostSession(apps, undefined, {}))).toBe(
			"streaming on this PC",
		);
	});

	it("names unknown running apps by ID", () => {
		expect(
			resolveHostSession(apps, { state: "busy", currentGame: 42 }, undefined)
				.runningAppName,
		).toBe("app 42");
	});
});

describe("decideAppPresentation", () => {
	const busyDesktop = { state: "busy" as const, currentGame: desktop.id };
	const present = (
		app: MoonlightApp,
		...args: Parameters<typeof resolveHostSession> extends [unknown, ...infer R]
			? R
			: never
	) => decideAppPresentation(app, resolveHostSession(apps, ...args));

	it("starts normally when the host is free or unknown", () => {
		const start = {
			primary: "start",
			disabled: false,
			offerQuitAndStart: false,
		};
		expect(
			present(desktop, { state: "free", currentGame: 0 }, undefined),
		).toEqual(start);
		expect(present(steam, undefined, undefined)).toEqual(start);
		expect(
			present(desktop, { state: "busy", currentGame: 0 }, undefined),
		).toEqual(start);
	});

	it("marks only the running app and offers Resume when not streamed here", () => {
		expect(present(desktop, busyDesktop, undefined)).toEqual({
			primary: "resume",
			marker: "running-on-host",
			disabled: false,
			offerQuitAndStart: false,
		});
		expect(present(steam, busyDesktop, undefined)).toEqual({
			primary: "host-busy",
			disabled: true,
			offerQuitAndStart: true,
		});
	});

	it("marks the app streamed by this PC and disables the others", () => {
		const local = { appName: "Desktop" };
		expect(present(desktop, busyDesktop, local)).toEqual({
			primary: "already-streaming",
			marker: "streaming-here",
			disabled: false,
			offerQuitAndStart: false,
		});
		// Real case: only Desktop is streamed, Steam Big Picture must not get a marker.
		expect(present(steam, busyDesktop, local)).toEqual({
			primary: "host-busy",
			disabled: true,
			offerQuitAndStart: false,
		});
	});

	it("disables every app when streaming here but the running app is unknown", () => {
		for (const app of apps) {
			expect(present(app, undefined, {})).toEqual({
				primary: "host-busy",
				disabled: true,
				offerQuitAndStart: false,
			});
		}
	});
});

describe("parseProcStatState / isExitedState", () => {
	it("parses a normal stat line", () => {
		expect(parseProcStatState("429589 (moonlight) S 21595 429589 0 0 -1")).toBe(
			"S",
		);
	});

	it("handles comm with spaces and parentheses", () => {
		expect(parseProcStatState("123 (my (weird) proc) R 1 2 3")).toBe("R");
		expect(parseProcStatState("124 (a) b) Z 1 2 3")).toBe("Z");
	});

	it("detects zombies and dead processes", () => {
		const zombie = "429589 (.moonlight-wrap) Z 21595 429589 0 0 -1 4227084";
		expect(parseProcStatState(zombie)).toBe("Z");
		expect(isExitedState("Z")).toBe(true);
		expect(isExitedState(parseProcStatState("5 (x) X 1") ?? "")).toBe(true);
		expect(isExitedState("S")).toBe(false);
		expect(isExitedState("R")).toBe(false);
		expect(isExitedState("D")).toBe(false);
	});

	it("rejects malformed input", () => {
		expect(parseProcStatState("")).toBeUndefined();
		expect(parseProcStatState("123 moonlight S")).toBeUndefined();
		expect(parseProcStatState("123 (moonlight)")).toBeUndefined();
	});
});

describe("buildLaunchCommand", () => {
	const args = ["stream", "Martins-Mac-mini.local", "Desktop"];

	it("launches through setsid -f when available", () => {
		expect(
			buildLaunchCommand(
				"/run/current-system/sw/bin/moonlight",
				args,
				"/run/current-system/sw/bin/setsid",
			),
		).toEqual({
			command: "/run/current-system/sw/bin/setsid",
			args: ["-f", "/run/current-system/sw/bin/moonlight", ...args],
		});
	});

	it("falls back to a direct spawn without setsid", () => {
		expect(buildLaunchCommand("moonlight", args)).toEqual({
			command: "moonlight",
			args,
		});
	});

	it("keeps the moonlight argv recognisable for /proc matching", () => {
		const { args: launched } = buildLaunchCommand(
			"/usr/bin/moonlight",
			args,
			"/usr/bin/setsid",
		);
		// After the fork, setsid execs moonlight with everything after "-f".
		const moonlightArgv = launched.slice(1);
		expect(isStreamProcessForHost(moonlightArgv, hostIdentifiers(host))).toBe(
			true,
		);
		expect(
			selectStreamPids(
				[{ pid: 500, argv: moonlightArgv }],
				hostIdentifiers(host),
			),
		).toEqual([500]);
	});
});
