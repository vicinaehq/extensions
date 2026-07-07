import { exec } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getPreferenceValues, LocalStorage, showToast } from "@vicinae/api";
import { FLOWW_CONFIG } from "./constants";
import { handleCommandError } from "./error-handler";

const CACHE_KEY_PATH = "floww_binary_path";
const CACHE_KEY_INSTALLED = "floww_installed";

const execAsync = promisify(exec);

let resolvedBinaryPath: string | null = null;
let flowwAvailable: boolean | null = null;

function resolveFlowwBinary(): string {
	if (resolvedBinaryPath) return resolvedBinaryPath;

	const preferences = getPreferenceValues<{ flowwPath?: string }>();
	if (preferences.flowwPath) {
		try {
			accessSync(preferences.flowwPath, constants.X_OK);
			resolvedBinaryPath = preferences.flowwPath;
			return resolvedBinaryPath;
		} catch {}
	}

	const defaultPath = join(homedir(), ".local", "bin", "floww");
	try {
		accessSync(defaultPath, constants.X_OK);
		resolvedBinaryPath = defaultPath;
		return resolvedBinaryPath;
	} catch {}

	resolvedBinaryPath = FLOWW_CONFIG.BINARY_PATH;
	return resolvedBinaryPath;
}

export interface ExecOptions {
	timeout?: number;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
}

export interface ExecResult {
	success: boolean;
	stdout: string;
	stderr: string;
	error?: string;
}

/**
 * Execute a shell command with proper error handling
 */
export async function executeCommand(
	command: string,
	options: ExecOptions = {},
): Promise<ExecResult> {
	try {
		const { stdout, stderr } = await execAsync(command, {
			timeout: options.timeout || 30000,
			cwd: options.cwd,
			env: options.env,
		});

		return {
			success: true,
			stdout: stdout.trim(),
			stderr: stderr.trim(),
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown command error";

		return {
			success: false,
			stdout: "",
			stderr: errorMessage,
			error: errorMessage,
		};
	}
}

/**
 * Execute a Floww CLI command with standardized error handling
 */
export async function executeFlowwCommand(
	subcommand: string,
	args: string[] = [],
): Promise<ExecResult> {
	const binaryPath = resolveFlowwBinary();
	const command = `"${binaryPath}" ${subcommand} ${args.map((arg) => `"${arg}"`).join(" ")}`;

	try {
		const result = await executeCommand(command);

		if (!result.success) {
			const flowwError = handleCommandError(
				result.error,
				`floww ${subcommand}`,
			);
			await showToast({
				title: "Floww Command Failed",
				message: flowwError.message,
			});
		}

		return result;
	} catch (error) {
		const flowwError = handleCommandError(error, `floww ${subcommand}`);
		await showToast({
			title: "Floww Command Error",
			message: flowwError.message,
		});

		return {
			success: false,
			stdout: "",
			stderr: flowwError.message,
			error: flowwError.message,
		};
	}
}

/**
 * Execute a Floww command silently (no toast notifications)
 */
export async function executeFlowwCommandSilent(
	subcommand: string,
	args: string[] = [],
): Promise<ExecResult> {
	const binaryPath = resolveFlowwBinary();
	const command = `"${binaryPath}" ${subcommand} ${args.map((arg) => `"${arg}"`).join(" ")}`;
	return executeCommand(command);
}

/**
 * Check if Floww binary exists and is executable
 */
export async function isFlowwAvailable(): Promise<boolean> {
	// LocalStorage cache survives Vicinae process teardown between opens
	const cachedPath = await LocalStorage.getItem<string>(CACHE_KEY_PATH);
	if (cachedPath) {
		try {
			accessSync(cachedPath, constants.X_OK);
			resolvedBinaryPath = cachedPath;
			return true;
		} catch {
			await LocalStorage.removeItem(CACHE_KEY_PATH);
			await LocalStorage.removeItem(CACHE_KEY_INSTALLED);
		}
	}

	// In-memory cache (same process, e.g. refresh after remove)
	if (flowwAvailable !== null) return flowwAvailable;

	try {
		const result = await executeFlowwCommandSilent("--version");
		flowwAvailable = result.success;
		const binPath = resolveFlowwBinary();
		if (binPath.includes("/")) {
			await LocalStorage.setItem(CACHE_KEY_PATH, binPath);
		}
		await LocalStorage.setItem(CACHE_KEY_INSTALLED, flowwAvailable);
		return flowwAvailable;
	} catch {
		flowwAvailable = false;
		await LocalStorage.setItem(CACHE_KEY_INSTALLED, false);
		return false;
	}
}
