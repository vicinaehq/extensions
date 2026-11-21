import { describe, expect, it } from "vitest";
import type { MoonlightApp, MoonlightHost } from "../src/lib/parse";
import {
	decideAppAction,
	hostIdentifiers,
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

describe("decideAppAction", () => {
	const free = { state: "free" as const, currentGame: 0 };
	const busyDesktop = { state: "busy" as const, currentGame: desktop.id };

	it("starts normally when the host is free or unknown", () => {
		expect(decideAppAction(desktop, apps, free, false)).toEqual({
			kind: "start",
		});
		expect(decideAppAction(desktop, apps, undefined, false)).toEqual({
			kind: "start",
		});
		expect(
			decideAppAction(desktop, apps, { state: "busy", currentGame: 0 }, false),
		).toEqual({ kind: "start" });
	});

	it("resumes the app that is running on the host", () => {
		expect(decideAppAction(desktop, apps, busyDesktop, false)).toEqual({
			kind: "resume",
			runningAppName: "Desktop",
		});
	});

	it("offers quit-and-start for other apps while the host is busy", () => {
		expect(decideAppAction(steam, apps, busyDesktop, false)).toEqual({
			kind: "quit-and-start",
			runningAppName: "Desktop",
		});
		expect(
			decideAppAction(steam, apps, { state: "busy", currentGame: 42 }, false),
		).toEqual({
			kind: "quit-and-start",
			runningAppName: "app 42",
		});
	});

	it("never starts a second stream while this PC is streaming the host", () => {
		expect(decideAppAction(desktop, apps, busyDesktop, true)).toEqual({
			kind: "already-streaming",
			runningAppName: "Desktop",
		});
		expect(decideAppAction(steam, apps, busyDesktop, true).kind).toBe(
			"already-streaming",
		);
		expect(decideAppAction(steam, apps, undefined, true).kind).toBe(
			"already-streaming",
		);
		expect(decideAppAction(steam, apps, free, true).kind).toBe(
			"already-streaming",
		);
	});
});
