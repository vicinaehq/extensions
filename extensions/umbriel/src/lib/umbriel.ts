import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 8 * 1024 * 1024;

export class UmbrielError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UmbrielError";
	}
}

function describeError(error: unknown): string {
	if (error && typeof error === "object") {
		const candidate = error as {
			code?: string;
			stderr?: string;
			stdout?: string;
			message?: string;
		};
		if (candidate.code === "ENOENT") {
			return "The umbriel command was not found on PATH. Start an Umbriel session or install Umbriel first.";
		}
		const stderr = candidate.stderr?.trim();
		if (stderr) return stderr.replace(/^error:\s*/i, "");
		const stdout = candidate.stdout?.trim();
		if (stdout) return stdout;
		if (candidate.message) return candidate.message;
	}
	return String(error);
}

async function run(args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileAsync("umbriel", args, {
			maxBuffer: MAX_BUFFER,
		});
		return stdout;
	} catch (error) {
		throw new UmbrielError(describeError(error));
	}
}

/**
 * Runs an inspection command with --json and parses the reply. A literal null
 * reply (for example the active submap) is returned as null.
 */
export async function query<T>(command: string): Promise<T> {
	const output = (await run([command, "--json"])).trim();
	if (!output || output === "null") return null as T;

	try {
		return JSON.parse(output) as T;
	} catch {
		throw new UmbrielError(`Umbriel returned invalid JSON for ${command}.`);
	}
}

/** Sends a compositor action through `umbriel msg`. */
export async function runAction(
	action: string,
	...args: string[]
): Promise<void> {
	await run(["msg", action, ...args]);
}

/** Runs a non-action CLI command such as output-create or output-destroy. */
export async function runCli(...args: string[]): Promise<string> {
	return run(args);
}
