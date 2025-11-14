import { showToast } from "@vicinae/api";
import { executeCommand, type ExecResult } from "./execute-command";



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
