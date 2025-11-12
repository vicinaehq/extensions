import { exec } from "node:child_process";
import { promisify } from "node:util";
import { showToast } from "@vicinae/api";

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
 * Execute an nmcli command with standardized error handling and toast notifications
 */
export async function executeNmcliCommand(
  subcommand: string,
  args: string[] = []
): Promise<ExecResult> {
  const command = `nmcli ${subcommand} ${args.join(" ")}`;

  try {
    const result = await executeCommand(command);

    if (!result.success) {
      await showToast({
        title: "Network Command Failed",
        message: result.error || "Unknown error occurred",
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await showToast({
      title: "Network Command Error",
      message: errorMessage,
    });

    return {
      success: false,
      stdout: "",
      stderr: errorMessage,
      error: errorMessage,
    };
  }
}

/**
 * Execute an iwctl command with standardized error handling and toast notifications
 */
export async function executeIwctlCommand(
  subcommand: string,
  args: string[] = []
): Promise<ExecResult> {
  const command = `iwctl ${subcommand} ${args.join(" ")}`;

  try {
    const result = await executeCommand(command);

    if (!result.success) {
      await showToast({
        title: "Network Command Failed",
        message: result.error || "Unknown error occurred",
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await showToast({
      title: "Network Command Error",
      message: errorMessage,
    });

    return {
      success: false,
      stdout: "",
      stderr: errorMessage,
      error: errorMessage,
    };
  }
}

/**
 * Execute an nmcli command silently (no toast notifications)
 */
export async function executeNmcliCommandSilent(
  subcommand: string,
  args: string[] = []
): Promise<ExecResult> {
  const command = `nmcli ${subcommand} ${args.join(" ")}`;
  return executeCommand(command);
}

/**
 * Execute an iwclt command silently (no toast notifications)
 */
export async function executeIwctlCommandSilent(
  subcommand: string,
  args: string[] = []
): Promise<ExecResult> {
  const command = `iwctl ${subcommand} ${args.join(" ")}`;
  return executeCommand(command);
}

/**
 * Check if nmcli is available
 */
export async function isNmcliAvailable(): Promise<boolean> {
  try {
    const result = await executeNmcliCommandSilent("--version");
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Check if iwctl is available
 */
export async function isIwcltAvailable(): Promise<boolean> {
  try {
    const result = await executeIwctlCommandSilent("--help");
    return result.success;
  } catch {
    return false;
  }
}
