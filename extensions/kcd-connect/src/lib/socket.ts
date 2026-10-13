import net from "node:net";
import path from "node:path";
import { getPreferenceValues } from "@vicinae/api";
import { KcdCommandError, KcdDaemonUnavailableError } from "./errors";
import { isKcdEvent, isRecord, type KcdEvent, type KcdResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const UNAVAILABLE_CODES = new Set([
	"ENOENT",
	"ECONNREFUSED",
	"EACCES",
	"EPERM",
]);

type Preferences = { socketPath?: string };

let cachedSocketPath: string | undefined;

export function socketPath(): string {
	if (cachedSocketPath) return cachedSocketPath;

	let override = "";
	try {
		override = (getPreferenceValues<Preferences>().socketPath ?? "").trim();
	} catch {
		// Preferences are unavailable outside a command context; fall through
		// to the default location rather than failing to connect at all.
	}

	if (override) {
		cachedSocketPath = override;
		return cachedSocketPath;
	}

	const runtimeDir =
		process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`;
	cachedSocketPath = path.join(runtimeDir, "kcd", "kcd.sock");
	return cachedSocketPath;
}

function classify(error: NodeJS.ErrnoException): Error {
	const code = error.code ?? "";
	if (UNAVAILABLE_CODES.has(code)) {
		return new KcdDaemonUnavailableError(socketPath(), code);
	}
	return error;
}

function encode(cmd: string, payload?: unknown): string {
	return `${JSON.stringify(payload === undefined ? { cmd } : { cmd, payload })}\n`;
}

/**
 * Sends one command and resolves with its `data`.
 *
 * The daemon serves exactly one request per connection: it reads a single
 * newline-terminated line, writes one reply line, then closes. So every call
 * dials a fresh socket, and the socket is destroyed on every exit path.
 */
export async function request<T = unknown>(
	cmd: string,
	payload?: unknown,
	options: { timeoutMs?: number } = {},
): Promise<T> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	return new Promise<T>((resolve, reject) => {
		const socket = net.createConnection(socketPath());
		let buffer = "";
		let settled = false;

		const finish = (err: Error | null, value?: T) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			if (err) reject(err);
			else resolve(value as T);
		};

		const timer = setTimeout(() => {
			finish(new Error(`kcd did not answer "${cmd}" within ${timeoutMs}ms`));
		}, timeoutMs);

		socket.setEncoding("utf8");

		socket.on("connect", () => socket.write(encode(cmd, payload)));

		socket.on("data", (chunk: string) => {
			buffer += chunk;
			const newline = buffer.indexOf("\n");
			if (newline === -1) return;

			const line = buffer.slice(0, newline);
			let parsed: KcdResponse;
			try {
				parsed = JSON.parse(line) as KcdResponse;
			} catch {
				finish(new Error(`kcd sent a malformed reply to "${cmd}"`));
				return;
			}

			if (!parsed.ok) {
				finish(new KcdCommandError(cmd, parsed.error ?? "unknown error"));
				return;
			}
			finish(null, parsed.data as T);
		});

		socket.on("error", (err: NodeJS.ErrnoException) => finish(classify(err)));

		socket.on("close", () => {
			finish(new Error(`kcd closed the connection before answering "${cmd}"`));
		});
	});
}

export type WatchHandle = { close: () => void };

export type WatchHandlers = {
	onEvent: (event: KcdEvent) => void;
	/** Fires once the daemon acknowledges the stream, before any event. */
	onReady?: () => void;
	onError?: (error: Error) => void;
	/** Fires when the stream ends for any reason other than close(). */
	onClose?: () => void;
};

/**
 * Opens a long-lived event stream.
 *
 * Unlike every other command, `watch` keeps the connection open: the first
 * line is an `{"ok":true}` acknowledgement and each line after it is an event.
 * The daemon sends a full `state.snapshot` immediately, so a caller needs no
 * separate bootstrap fetch.
 *
 * Pass an empty `events` array to receive everything.
 */
export function openWatch(
	events: string[],
	handlers: WatchHandlers,
): WatchHandle {
	const socket = net.createConnection(socketPath());
	let buffer = "";
	let acknowledged = false;
	let closedByCaller = false;

	socket.setEncoding("utf8");

	socket.on("connect", () => {
		socket.write(
			encode("watch", events.length > 0 ? { events } : { events: [] }),
		);
	});

	socket.on("data", (chunk: string) => {
		buffer += chunk;

		let newline = buffer.indexOf("\n");
		while (newline !== -1) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			newline = buffer.indexOf("\n");

			if (line === "") continue;

			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				// One unreadable line must not tear down a long-lived stream.
				continue;
			}

			if (!acknowledged) {
				acknowledged = true;
				if (isRecord(parsed) && parsed.ok === false) {
					handlers.onError?.(
						new Error(
							typeof parsed.error === "string"
								? parsed.error
								: "kcd refused the event stream",
						),
					);
					socket.destroy();
					return;
				}
				handlers.onReady?.();
				continue;
			}

			if (isKcdEvent(parsed)) handlers.onEvent(parsed);
		}
	});

	socket.on("error", (err: NodeJS.ErrnoException) => {
		if (closedByCaller) return;
		handlers.onError?.(classify(err));
	});

	socket.on("close", () => {
		if (closedByCaller) return;
		handlers.onClose?.();
	});

	return {
		close: () => {
			closedByCaller = true;
			socket.destroy();
		},
	};
}
