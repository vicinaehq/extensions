import { spawn } from "node:child_process";

export interface ExecOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number;
}

export interface ExecResult {
	success: boolean;
	stdout: string;
	stderr: string;
	error?: string;
}

/**
 * Execute a command *detached* so it continues running
 * even if the parent process (launcher UI) exits.
 */
export function executeCommand(
	command: string,
	options: ExecOptions = {},
): ExecResult {
	const [cmd, ...args] = command.split(" ");

	const child = spawn(cmd, args, {
		cwd: options.cwd,
		env: options.env,
		detached: true,
		stdio: "ignore", // Fully detached
	});

	child.unref();

	// Return immediately and and don't wait for the child process to exit
	return {
		success: true,
		stdout: "",
		stderr: "",
	};
}
