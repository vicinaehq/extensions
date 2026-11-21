// Pure parsing helpers for moonlight-qt data. No Vicinae imports here so the
// logic can be unit-tested with vitest.

export interface MoonlightHost {
	/** Index of the host inside the [hosts] array of Moonlight.conf. */
	index: number;
	/** Display name of the host. Also used as the CLI argument for moonlight. */
	name: string;
	uuid?: string;
	localAddress?: string;
	remoteAddress?: string;
	manualAddress?: string;
	/** HTTP port of the host (`localport`, usually 47989). */
	localPort?: number;
	/** Apps as last seen by the Moonlight GUI (used as a fallback before the first refresh). */
	apps: MoonlightApp[];
}

export interface MoonlightApp {
	name: string;
	id: number;
	hdr: boolean;
	appCollectionGame: boolean;
	hidden: boolean;
	directLaunch: boolean;
	/** Box art location as reported by moonlight (usually a file:// URL). */
	boxArtUrl?: string;
}

/** Matches moonlight-qt log lines such as `12:34:56 - SDL Info (0): ...`. */
const LOG_LINE = /^\d{2}:\d{2}:\d{2}\s+-\s/;

/**
 * Decode a single Qt QSettings INI value. Only the subset needed for host
 * names and addresses is supported: surrounding quotes and backslash escapes.
 */
function decodeIniValue(raw: string): string {
	let value = raw.trim();
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
		value = value.slice(1, -1);
	}
	return value.replace(/\\(x[0-9a-fA-F]{1,4}|.)/g, (_match, esc: string) => {
		if (esc.startsWith("x") && esc.length > 1) {
			return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
		}
		switch (esc) {
			case "n":
				return "\n";
			case "t":
				return "\t";
			case "r":
				return "\r";
			default:
				return esc;
		}
	});
}

function parseBool(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === "true";
}

/**
 * Extract the raw key/value pairs of the `[hosts]` section only. Every other
 * section (notably `[General]`, which holds the client private key and
 * certificate) is skipped without being retained.
 */
export function extractHostsSection(ini: string): Map<string, string> {
	const entries = new Map<string, string>();
	let inHosts = false;
	for (const rawLine of ini.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.startsWith("[") && line.endsWith("]")) {
			inHosts = line.slice(1, -1).trim().toLowerCase() === "hosts";
			continue;
		}
		if (
			!inHosts ||
			line === "" ||
			line.startsWith(";") ||
			line.startsWith("#")
		) {
			continue;
		}
		const eq = line.indexOf("=");
		if (eq <= 0) continue;
		// QSettings writes array keys as `1\hostname`; normalise separators.
		const key = line.slice(0, eq).trim().replace(/\//g, "\\").toLowerCase();
		entries.set(key, line.slice(eq + 1));
	}
	return entries;
}

/** Parse the paired hosts (and their known apps) from the contents of Moonlight.conf. */
export function parseHosts(ini: string): MoonlightHost[] {
	const entries = extractHostsSection(ini);
	const get = (key: string) => {
		const raw = entries.get(key.toLowerCase());
		return raw === undefined ? undefined : decodeIniValue(raw);
	};

	// Collect host indices from the keys rather than trusting `size` alone.
	const indices = new Set<number>();
	for (const key of entries.keys()) {
		const match = /^(\d+)\\/.exec(key);
		if (match?.[1]) indices.add(Number.parseInt(match[1], 10));
	}

	const hosts: MoonlightHost[] = [];
	for (const index of [...indices].sort((a, b) => a - b)) {
		const prefix = `${index}\\`;
		const name = get(`${prefix}hostname`)?.trim();
		if (!name) continue;

		const apps: MoonlightApp[] = [];
		const appCount =
			Number.parseInt(get(`${prefix}apps\\size`) ?? "0", 10) || 0;
		for (let a = 1; a <= appCount; a++) {
			const appPrefix = `${prefix}apps\\${a}\\`;
			const appName = get(`${appPrefix}name`);
			const id = Number.parseInt(get(`${appPrefix}id`) ?? "", 10);
			if (!appName || Number.isNaN(id)) continue;
			apps.push({
				name: appName,
				id,
				hdr: parseBool(get(`${appPrefix}hdr`)),
				appCollectionGame: parseBool(get(`${appPrefix}appcollector`)),
				hidden: parseBool(get(`${appPrefix}hidden`)),
				directLaunch: parseBool(get(`${appPrefix}directlaunch`)),
			});
		}

		hosts.push({
			index,
			name,
			uuid: get(`${prefix}uuid`) || undefined,
			localAddress: get(`${prefix}localaddress`) || undefined,
			remoteAddress: get(`${prefix}remoteaddress`) || undefined,
			manualAddress: get(`${prefix}manualaddress`) || undefined,
			localPort:
				Number.parseInt(get(`${prefix}localport`) ?? "", 10) || undefined,
			apps,
		});
	}
	return hosts;
}

/** Split one CSV line into fields, honouring double quotes and `""` escapes. */
export function splitCsvLine(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ",") {
			fields.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	fields.push(current);
	return fields.map((f) => f.trim());
}

/**
 * Parse the output of `moonlight list --csv <host>`. Log lines and anything
 * before the CSV header are ignored.
 */
export function parseAppListCsv(output: string): MoonlightApp[] {
	const apps: MoonlightApp[] = [];
	let seenHeader = false;
	for (const rawLine of output.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || LOG_LINE.test(line)) continue;
		if (!seenHeader) {
			if (/^"?Name"?\s*,\s*"?ID"?\s*,/i.test(line)) seenHeader = true;
			continue;
		}
		const fields = splitCsvLine(line);
		if (fields.length < 7) continue;
		const [name, id, hdr, collection, hidden, direct, ...boxArt] = fields;
		const parsedId = Number.parseInt(id ?? "", 10);
		if (!name || Number.isNaN(parsedId)) continue;
		const boxArtUrl = boxArt.join(",");
		apps.push({
			name,
			id: parsedId,
			hdr: parseBool(hdr),
			appCollectionGame: parseBool(collection),
			hidden: parseBool(hidden),
			directLaunch: parseBool(direct),
			boxArtUrl: boxArtUrl || undefined,
		});
	}
	if (!seenHeader) {
		throw new Error(
			"Unexpected output from moonlight list (no CSV header found)",
		);
	}
	return apps;
}

/** Extract a human readable error from moonlight output, skipping log lines. */
export function extractErrorMessage(output: string): string | undefined {
	const lines = output
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l !== "" && !LOG_LINE.test(l));
	return lines.at(-1);
}

export interface StreamPreferences {
	resolution?: string;
	fps?: string;
	bitrate?: string;
	displayMode?: string;
	quitAfter?: string;
}

const RESOLUTION_FLAGS: Record<string, string> = {
	"720": "--720",
	"1080": "--1080",
	"1440": "--1440",
	"4K": "--4K",
};

const DISPLAY_MODES = new Set(["borderless", "fullscreen", "windowed"]);

function positiveInt(
	value: string | undefined,
	label: string,
): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	if (!/^\d+$/.test(trimmed) || Number.parseInt(trimmed, 10) <= 0) {
		throw new Error(
			`${label} must be a positive whole number (got "${trimmed}")`,
		);
	}
	return String(Number.parseInt(trimmed, 10));
}

/** Translate extension preferences into extra `moonlight stream` flags. */
export function buildStreamFlags(prefs: StreamPreferences): string[] {
	const flags: string[] = [];
	const resolutionFlag = prefs.resolution
		? RESOLUTION_FLAGS[prefs.resolution]
		: undefined;
	if (resolutionFlag) flags.push(resolutionFlag);

	const fps = positiveInt(prefs.fps, "Frame rate");
	if (fps) flags.push("--fps", fps);

	const bitrate = positiveInt(prefs.bitrate, "Bitrate");
	if (bitrate) flags.push("--bitrate", bitrate);

	if (prefs.displayMode && DISPLAY_MODES.has(prefs.displayMode)) {
		flags.push("--display-mode", prefs.displayMode);
	}

	if (prefs.quitAfter === "quit") flags.push("--quit-after");
	else if (prefs.quitAfter === "no-quit") flags.push("--no-quit-after");

	return flags;
}

export function buildStreamArgs(
	host: string,
	app: string,
	prefs: StreamPreferences,
): string[] {
	return ["stream", ...buildStreamFlags(prefs), host, app];
}

/** Quote an argument for POSIX shells (used for the "Copy stream command" action). */
export function shellQuote(arg: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
	return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(bin: string, args: string[]): string {
	return [bin, ...args].map(shellQuote).join(" ");
}
