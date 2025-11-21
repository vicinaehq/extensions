import { showToast } from "@vicinae/api";
import { executeCommand, type ExecResult } from "./execute-command";


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
