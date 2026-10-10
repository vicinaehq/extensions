import { execFile } from "node:child_process";

/**
 * Every failure mode we can distinguish from what `osascript` reports.
 *
 * The messages osascript prints on stderr are localised to the user's system
 * language, so we key off the numeric AppleScript error code only. The codes
 * Kaset itself raises are documented in its `ScriptCommands.swift`.
 */
export type KasetErrorKind =
	| "not-installed"
	| "not-running"
	| "not-ready"
	| "timeout"
	| "not-authorized"
	| "bad-argument"
	| "unsupported"
	| "unknown";

export class KasetError extends Error {
	readonly kind: KasetErrorKind;
	/** Raw message from osascript, when there was one. Localised, so only for debugging. */
	readonly detail?: string;

	constructor(kind: KasetErrorKind, message: string, detail?: string) {
		super(message);
		this.name = "KasetError";
		this.kind = kind;
		this.detail = detail;
	}
}

/** Sentinel returned by scripts that check whether Kaset is running before acting. */
export const NOT_RUNNING = "__KASET_NOT_RUNNING__";

const DEFAULT_TIMEOUT_MS = 5_000;
/** Extra head room so the AppleScript `with timeout` fires before we kill the process. */
const KILL_GRACE_MS = 2_000;

/** Quote a value for interpolation into an AppleScript string literal. */
export function quote(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const CODE_MAP: Record<number, KasetErrorKind> = {
	[-1712]: "timeout", // errAETimeout - the app never answered the Apple event
	[-1728]: "not-ready", // errAENoSuchObject - Kaset uses this for "player not initialized"
	[-1743]: "not-authorized", // errAEEventNotPermitted - Automation permission denied
	[-1700]: "bad-argument", // errAECoercionFail - wrong parameter type
	[-1708]: "unsupported", // errAEEventNotHandled - command missing from this Kaset build
	[-600]: "not-running", // procNotFound
	[-609]: "not-running", // connectionInvalid
};

const MESSAGES: Record<KasetErrorKind, string> = {
	"not-installed": "Kaset does not seem to be installed.",
	"not-running": "Kaset is not running.",
	"not-ready": "Kaset is still starting up. Give it a moment and try again.",
	timeout: "Kaset did not respond. Try restarting it.",
	"not-authorized":
		"Vicinae is not allowed to control Kaset. Enable it in System Settings > Privacy & Security > Automation.",
	"bad-argument": "Kaset rejected that value.",
	unsupported: "This Kaset build does not support that command.",
	unknown: "Kaset returned an unexpected error.",
};

function classify(stderr: string): KasetError {
	const detail = stderr.trim();
	const match = detail.match(/\((-?\d+)\)\s*$/);
	const code = match ? Number.parseInt(match[1], 10) : Number.NaN;
	const kind = CODE_MAP[code] ?? "unknown";

	// Kaset reuses -1728 for an out-of-range queue index; that message is worth surfacing.
	if (kind === "not-ready" && /index/i.test(detail)) {
		return new KasetError(
			"bad-argument",
			"That track is no longer in the queue.",
			detail,
		);
	}

	return new KasetError(kind, MESSAGES[kind], detail || undefined);
}

type RunOptions = {
	/** Seconds given to the Apple event itself. Defaults to 5. */
	timeoutMs?: number;
};

/**
 * Run a block of AppleScript and return its result as text.
 *
 * The body is wrapped in `with timeout of N seconds` and the `osascript` process
 * is additionally killed a couple of seconds later, so neither a wedged Kaset nor
 * a stuck helper process can ever hang a command. Each line is passed as its own
 * `-e` argument, so nothing is ever handed to a shell.
 */
export function runAppleScript(
	body: string[],
	options: RunOptions = {},
): Promise<string> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
	const lines = [`with timeout of ${seconds} seconds`, ...body, "end timeout"];
	const args = lines.flatMap((line) => ["-e", line]);

	return new Promise((resolve, reject) => {
		execFile(
			"osascript",
			args,
			{
				timeout: timeoutMs + KILL_GRACE_MS,
				killSignal: "SIGKILL",
				maxBuffer: 4 * 1024 * 1024,
			},
			(error, stdout, stderr) => {
				if (!error) return resolve(stdout.trim());

				const killed = (error as NodeJS.ErrnoException & { killed?: boolean })
					.killed;
				if (killed) {
					return reject(
						new KasetError(
							"timeout",
							MESSAGES.timeout,
							stderr.trim() || undefined,
						),
					);
				}
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					return reject(
						new KasetError(
							"unknown",
							"Could not find osascript. This extension only runs on macOS.",
						),
					);
				}
				reject(classify(stderr));
			},
		);
	});
}
