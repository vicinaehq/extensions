import { exec } from "node:child_process";
import { promisify } from "node:util";
import { showToast } from "@vicinae/api";
import { FLOWW_CONFIG } from "./constants";
import { handleCommandError } from "./error-handler";

const execAsync = promisify(exec);

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
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: options.timeout || 30000, // 30 second default timeout
      cwd: options.cwd,
      env: options.env,
    });

    return {
      success: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown command error";

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
  args: string[] = []
): Promise<ExecResult> {
  const command = `"${FLOWW_CONFIG.BINARY_PATH}" ${subcommand} ${args.map((arg) => `"${arg}"`).join(" ")}`;

  try {
    const result = await executeCommand(command);

    if (!result.success) {
      const flowwError = handleCommandError(result.error, `floww ${subcommand}`);
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
  args: string[] = []
): Promise<ExecResult> {
  const command = `"${FLOWW_CONFIG.BINARY_PATH}" ${subcommand} ${args.map((arg) => `"${arg}"`).join(" ")}`;
  return executeCommand(command);
}

/**
 * Check if Floww binary exists and is executable
 */
export async function isFlowwAvailable(): Promise<boolean> {
  try {
    const result = await executeFlowwCommandSilent("--version");
    return result.success;
  } catch {
    return false;
  }
}
