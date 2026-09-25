import { execFile } from "node:child_process";

export type ExecResult = {
	ok: boolean;
	code: number | null;
	stdout: string;
	stderr: string;
};

export type ExecOptions = {
	/**
	 * Data written to the child's stdin.
	 */
	input?: string;
	/**
	 * Kill the process and fail if it runs longer than this (ms).
	 */
	timeout?: number;
	/**
	 * Working directory for the child process.
	 */
	cwd?: string;
	/**
	 * Replace (or extend) the environment passed to the child.
	 */
	env?: Record<string, string>;
	maxBuffer?: number;
};

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Run a command with `execFile` (no shell, no injection risk) and resolve with
 * its exit status and captured output. Never rejects for non-zero exit codes.
 */
export function run(
	command: string,
	args: string[] = [],
	options: ExecOptions = {},
): Promise<ExecResult> {
	return new Promise((resolve) => {
		const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C" };
		if (options.env) {
			Object.assign(env, options.env);
		}
		execFile(
			command,
			args,
			{
				env,
				timeout: options.timeout ?? 120_000,
				maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
				encoding: "utf8",
				cwd: options.cwd,
			},
			(error, stdout, stderr) => {
				if (!error) {
					resolve({ ok: true, code: 0, stdout, stderr });
					return;
				}
				const code = typeof error.code === "number" ? error.code : null;
				if (stderr === "" && typeof error.message === "string") {
					stderr = error.message;
				}
				resolve({ ok: code === 0, code, stdout, stderr });
			},
		)?.stdin?.end(options.input ?? "");
	});
}
