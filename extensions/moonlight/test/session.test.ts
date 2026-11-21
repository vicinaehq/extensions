import { describe, expect, it } from "vitest";
import type { MoonlightApp, MoonlightHost } from "../src/lib/parse";
import {
	decideAppPresentation,
	hostIdentifiers,
	hostStatusSummary,
	localStreamTarget,
	resolveHostSession,
	selectStreamPids,
	visibleApps,
	isStreamProcessForHost,
	parseServerInfo,
	serverInfoUrl,
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

	it("falls back to currentgame for unknown state strings (GeForce Experience)", () => {
		expect(
			parseServerInfo(
				'<root status_code="200"><currentgame>5</currentgame><state>MJOLNIR_STATE_X</state></root>',
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

describe("serverInfoUrl", () => {
	it("uses the local address and port", () => {
		expect(serverInfoUrl(host)).toBe(
			"http://192.168.0.86:47989/serverinfo?uniqueid=0123456789ABCDEF",
		);
	});

	it("falls back to the hostname and default port", () => {
		expect(serverInfoUrl({ index: 2, name: "box.local", apps: [] })).toBe(
			"http://box.local:47989/serverinfo?uniqueid=0123456789ABCDEF",
		);
	});

	it("brackets IPv6 addresses", () => {
		expect(
			serverInfoUrl({
				index: 3,
				name: "v6",
				localAddress: "fd00::1",
				localPort: 1234,
				apps: [],
			}),
		).toBe("http://[fd00::1]:1234/serverinfo?uniqueid=0123456789ABCDEF");
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
