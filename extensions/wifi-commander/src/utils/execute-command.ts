import { exec } from "node:child_process";
import { promisify } from "node:util";

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