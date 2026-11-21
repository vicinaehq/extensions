import { describe, expect, it } from "vitest";
import {
	buildStreamArgs,
	extractErrorMessage,
	extractHostsSection,
	formatCommand,
	parseAppListCsv,
	parseHosts,
	splitCsvLine,
} from "../src/lib/parse";

const BOXART =
	"file:///home/user/.cache/Moonlight Game Streaming Project/Moonlight/boxart/22F27EF2-0000/";

// Shape of a real Moonlight.conf; secrets replaced with placeholders.
const CONF = String.raw`[General]
certificate=@ByteArray(-----BEGIN CERTIFICATE-----\nSECRET_CERT\n-----END CERTIFICATE-----\n)
key=@ByteArray(-----BEGIN PRIVATE KEY-----\nSECRET_KEY\n-----END PRIVATE KEY-----\n)
1\hostname=not-a-host

[gcmapping]
size=0

[hosts]
1\apps\1\appcollector=false
1\apps\1\directlaunch=true
1\apps\1\hdr=true
1\apps\1\hidden=false
1\apps\1\id=881448767
1\apps\1\name=Desktop
1\apps\2\appcollector=false
1\apps\2\directlaunch=false
1\apps\2\hdr=true
1\apps\2\hidden=true
1\apps\2\id=1093255277
1\apps\2\name=Steam Big Picture
1\apps\size=2
1\customname=false
1\hostname=Martins-Mac-mini.local
1\ipv6address=2a02:db8::1
1\localaddress=192.168.0.86
1\localport=47989
1\mac=@ByteArray(\0\0\0\0\0\0)
1\manualaddress=martins-mac-mini.local
1\remoteaddress=203.0.113.7
1\srvcert=@ByteArray(-----BEGIN CERTIFICATE-----\nSERVER_CERT\n-----END CERTIFICATE-----\n)
1\uuid=22F27EF2-B21B-272E-5C9F-BFC5B1D978B2
2\hostname="Living Room, PC"
2\localaddress=192.168.0.20
2\uuid=AAAA
size=2
`;

describe("parseHosts", () => {
	it("parses hosts and their apps from the [hosts] section", () => {
		const hosts = parseHosts(CONF);
		expect(hosts).toHaveLength(2);
		const [mac, pc] = hosts;
		expect(mac).toMatchObject({
			index: 1,
			name: "Martins-Mac-mini.local",
			uuid: "22F27EF2-B21B-272E-5C9F-BFC5B1D978B2",
			localAddress: "192.168.0.86",
			manualAddress: "martins-mac-mini.local",
			remoteAddress: "203.0.113.7",
		});
		expect(mac?.apps).toEqual([
			{
				name: "Desktop",
				id: 881448767,
				hdr: true,
				appCollectionGame: false,
				hidden: false,
				directLaunch: true,
			},
			{
				name: "Steam Big Picture",
				id: 1093255277,
				hdr: true,
				appCollectionGame: false,
				hidden: true,
				directLaunch: false,
			},
		]);
		expect(pc).toMatchObject({ index: 2, name: "Living Room, PC", apps: [] });
	});

	it("never reads keys outside the [hosts] section", () => {
		const entries = extractHostsSection(CONF);
		const values = [...entries.values()].join("\n");
		expect(values).not.toContain("SECRET_KEY");
		expect(values).not.toContain("SECRET_CERT");
		expect(parseHosts(CONF).map((h) => h.name)).not.toContain("not-a-host");
	});

	it("returns no hosts when there is no [hosts] section", () => {
		expect(parseHosts("[General]\nkey=secret\n")).toEqual([]);
		expect(parseHosts("")).toEqual([]);
	});

	it("handles CRLF line endings", () => {
		const hosts = parseHosts("[hosts]\r\n1\\hostname=box\r\nsize=1\r\n");
		expect(hosts.map((h) => h.name)).toEqual(["box"]);
	});
});

describe("parseAppListCsv", () => {
	const header =
		"Name, ID, HDR Support, App Collection Game, Hidden, Direct Launch, Boxart URL";
	const realOutput = [
		header,
		`"Desktop",881448767,true,false,false,true,"${BOXART}881448767.png"`,
		`"Steam Big Picture",1093255277,true,false,true,false,"${BOXART}1093255277.png"`,
	].join("\n");

	it("parses the real moonlight list output", () => {
		expect(parseAppListCsv(realOutput)).toEqual([
			{
				name: "Desktop",
				id: 881448767,
				hdr: true,
				appCollectionGame: false,
				hidden: false,
				directLaunch: true,
				boxArtUrl: `${BOXART}881448767.png`,
			},
			{
				name: "Steam Big Picture",
				id: 1093255277,
				hdr: true,
				appCollectionGame: false,
				hidden: true,
				directLaunch: false,
				boxArtUrl: `${BOXART}1093255277.png`,
			},
		]);
	});

	it("filters out log lines before and between rows", () => {
		const noisy = [
			"00:00:00 - SDL Info (0): Moonlight Qt v6.1.0",
			"00:00:01 - Qt Info: Found host: Martins-Mac-mini.local",
			header,
			`"Desktop",881448767,true,false,false,false,"${BOXART}881448767.png"`,
			"00:00:02 - Qt Warning: something happened",
			`"Steam Big Picture",1093255277,true,false,false,false,"${BOXART}1093255277.png"`,
			"",
		].join("\n");
		expect(parseAppListCsv(noisy).map((a) => a.name)).toEqual([
			"Desktop",
			"Steam Big Picture",
		]);
	});

	it("handles commas and escaped quotes in app names", () => {
		const out = `${header}\n"Halo: ""MCC"", Edition",42,false,true,false,false,""`;
		const [app] = parseAppListCsv(out);
		expect(app).toMatchObject({
			name: 'Halo: "MCC", Edition',
			id: 42,
			appCollectionGame: true,
		});
		expect(app?.boxArtUrl).toBeUndefined();
	});

	it("returns an empty list for a host without apps", () => {
		expect(parseAppListCsv(header)).toEqual([]);
	});

	it("throws when the output has no CSV header", () => {
		expect(() =>
			parseAppListCsv("00:00:00 - Qt Info: hi\nFailed to connect to host"),
		).toThrow(/CSV header/);
	});
});

describe("helpers", () => {
	it("splits CSV lines", () => {
		expect(splitCsvLine('"a",1,"b,c"')).toEqual(["a", "1", "b,c"]);
	});

	it("extracts the last non-log line as error", () => {
		expect(
			extractErrorMessage(
				"00:00:00 - Qt Info: x\nFailed to connect to 10.0.0.1\n",
			),
		).toBe("Failed to connect to 10.0.0.1");
		expect(extractErrorMessage("00:00:00 - Qt Info: x\n")).toBeUndefined();
	});

	it("builds stream args with no flags by default", () => {
		expect(buildStreamArgs("host", "Desktop", {})).toEqual([
			"stream",
			"host",
			"Desktop",
		]);
		expect(
			buildStreamArgs("host", "Desktop", {
				resolution: "default",
				fps: "",
				bitrate: " ",
				displayMode: "default",
				quitAfter: "default",
			}),
		).toEqual(["stream", "host", "Desktop"]);
	});

	it("builds stream args from preferences", () => {
		expect(
			buildStreamArgs("host", "Desktop", {
				resolution: "1440",
				fps: "120",
				bitrate: "30000",
				displayMode: "borderless",
				quitAfter: "no-quit",
			}),
		).toEqual([
			"stream",
			"--1440",
			"--fps",
			"120",
			"--bitrate",
			"30000",
			"--display-mode",
			"borderless",
			"--no-quit-after",
			"host",
			"Desktop",
		]);
		expect(
			buildStreamArgs("h", "a", { resolution: "4K", quitAfter: "quit" }),
		).toEqual(["stream", "--4K", "--quit-after", "h", "a"]);
	});

	it("rejects invalid numeric preferences", () => {
		expect(() => buildStreamArgs("h", "a", { fps: "sixty" })).toThrow(
			/Frame rate/,
		);
		expect(() => buildStreamArgs("h", "a", { bitrate: "-5" })).toThrow(
			/Bitrate/,
		);
	});

	it("formats a copyable shell command", () => {
		expect(
			formatCommand("moonlight", [
				"stream",
				"Martins-Mac-mini.local",
				"Steam Big Picture",
			]),
		).toBe("moonlight stream Martins-Mac-mini.local 'Steam Big Picture'");
		expect(formatCommand("moonlight", ["stream", "h", "Tony's Game"])).toBe(
			"moonlight stream h 'Tony'\\''s Game'",
		);
	});
});
