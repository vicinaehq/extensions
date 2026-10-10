import { showToast, Toast } from "@vicinae/api";

/**
 * The socket is missing, refused, or unreadable — in every case the actionable
 * advice is the same, so callers never have to inspect an errno themselves.
 */
export class KcdDaemonUnavailableError extends Error {
	readonly socketPath: string;
	readonly code: string;

	constructor(socketPath: string, code: string) {
		super(`kcd daemon is not reachable at ${socketPath} (${code})`);
		this.name = "KcdDaemonUnavailableError";
		this.socketPath = socketPath;
		this.code = code;
	}
}

/** A well-formed `{"ok":false,"error":...}` reply from the daemon. */
export class KcdCommandError extends Error {
	readonly cmd: string;

	constructor(cmd: string, message: string) {
		super(message);
		this.name = "KcdCommandError";
		this.cmd = cmd;
	}
}

export function isDaemonUnavailable(error: unknown): boolean {
	return error instanceof KcdDaemonUnavailableError;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Presents any failure from the client layer. Daemon-down gets a fixed,
 * actionable message; daemon-reported errors are shown verbatim, since kcd
 * already phrases them for humans ("device not found", "device not connected").
 */
export async function showKcdError(
	error: unknown,
	fallbackTitle = "kcd error",
): Promise<void> {
	if (error instanceof KcdDaemonUnavailableError) {
		await showToast({
			style: Toast.Style.Failure,
			title: "kcd daemon is not running",
			message: "Start it with: systemctl --user start kcd",
		});
		return;
	}

	await showToast({
		style: Toast.Style.Failure,
		title: fallbackTitle,
		message: errorMessage(error),
	});
}
