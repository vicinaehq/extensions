import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { showToast, Toast } from "@vicinae/api";

const execFileAsync = promisify(execFile);

/** Fallback when the Homebrew cask has not symlinked the CLI onto PATH. */
const BUNDLED_CLI = "/Applications/Abendrot.app/Contents/Helpers/abendrot";
const TIMEOUT_MS = 10_000;

export interface DisplayStatus {
	id?: string;
	name?: string;
	appliedMethod?: string;
	warmthStrength?: number;
	warmthOverridden?: boolean;
	isHardwareDDCEnabled?: boolean;
	lastError?: string;
}

/** Fields of `abendrot status --json`. See AGENTS.md in the Abendrot repo for the full schema. */
export interface AbendrotStatus {
	running?: boolean;
	cliVersion?: string;
	appVersion?: string;
	appBuild?: string;
	updatedAt?: string;
	isEnabled?: boolean;
	scheduleMode?: string;
	isScheduleActiveNow?: boolean;
	isRevealing?: boolean;
	cozy?: boolean;
	globalWarmthStrength?: number;
	globalKelvin?: number;
	warmestPointKelvin?: number;
	revealMode?: string;
	excludedApps?: string[];
	displays?: DisplayStatus[];
}

export interface ApplyResult {
	ok?: boolean;
	appliedLive?: boolean;
	persisted?: boolean;
}

/** CLI failure carrying the `abendrot` exit code, mapped to a user-facing message. */
export class CliError extends Error {
	readonly exitCode: number;

	constructor(exitCode: number, message: string) {
		super(message);
		this.exitCode = exitCode;
	}
}

interface RunResult {
	stdout: string;
	stderr: string;
	code: number;
}

/** Exit codes from the Abendrot CLI docs: 2 bad input, 3 app not running, 4 live-apply timeout. */
const EXIT_MESSAGES: Record<number, string> = {
	2: "Abendrot rejected that value",
	3: "The Abendrot app is not running",
	4: "Saved, but the app did not confirm the change",
};

function failureMessage(result: RunResult): string {
	return EXIT_MESSAGES[result.code] ?? (result.stderr || `abendrot exited with code ${result.code}`);
}

async function run(binary: string, args: string[]): Promise<RunResult> {
	try {
		const { stdout, stderr } = await execFileAsync(binary, args, {
			encoding: "utf8",
			timeout: TIMEOUT_MS,
		});
		return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
	} catch (error) {
		const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
		if (failure.code === "ENOENT") throw failure;
		// Non-zero exit: the CLI reports its own reason on stderr, surface it as a result.
		if (typeof failure.code === "number") {
			return {
				stdout: (failure.stdout ?? "").trim(),
				stderr: (failure.stderr ?? "").trim(),
				code: failure.code,
			};
		}
		throw failure;
	}
}

async function runAbendrot(args: string[]): Promise<RunResult> {
	try {
		return await run("abendrot", args);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	try {
		return await run(BUNDLED_CLI, args);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new CliError(
				127,
				"Abendrot CLI not found. Install it with: brew install --cask matthewrball/tap/abendrot",
			);
		}
		throw error;
	}
}

/** Run `abendrot <args> --json` and parse the JSON output. Throws CliError on any non-zero exit. */
export async function json<T>(args: string[]): Promise<T> {
	const result = await runAbendrot([...args, "--json"]);
	if (result.code !== 0) throw new CliError(result.code, failureMessage(result));
	try {
		return JSON.parse(result.stdout) as T;
	} catch {
		throw new CliError(0, `Unexpected output from abendrot: ${result.stdout.slice(0, 120)}`);
	}
}

/** Run a `set`/`on`/`off`/`cozy`/`reveal` command and return its apply report. */
export async function apply(args: string[]): Promise<ApplyResult> {
	const result = await runAbendrot([...args, "--json"]);
	if (result.code !== 0) throw new CliError(result.code, failureMessage(result));
	try {
		return JSON.parse(result.stdout) as ApplyResult;
	} catch {
		return {};
	}
}

export async function fail(error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	await showToast({ style: Toast.Style.Failure, title: "Abendrot", message });
}