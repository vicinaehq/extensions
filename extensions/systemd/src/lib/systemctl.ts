import { exec } from "child_process";
import { promisify } from "util";
import { Toast, showToast } from "@vicinae/api";

const execAsync = promisify(exec);

// Control service actions using systemctl command (handles authentication properly)
export async function startService(
  serviceName: string,
  type: "system" | "user" = "system",
): Promise<void> {
  return performServiceActionCommand(serviceName, type, "start", "Starting");
}

export async function stopService(
  serviceName: string,
  type: "system" | "user" = "system",
): Promise<void> {
  return performServiceActionCommand(serviceName, type, "stop", "Stopping");
}

export async function restartService(
  serviceName: string,
  type: "system" | "user" = "system",
): Promise<void> {
  return performServiceActionCommand(
    serviceName,
    type,
    "restart",
    "Restarting",
  );
}

export async function reloadService(
  serviceName: string,
  type: "system" | "user" = "system",
): Promise<void> {
  return performServiceActionCommand(serviceName, type, "reload", "Reloading");
}

export async function enableService(
  serviceName: string,
  type: "system" | "user" = "system",
): Promise<void> {
  return performServiceActionCommand(serviceName, type, "enable", "Enabling");
}

export async function disableService(
  serviceName: string,
  type: "system" | "user" = "system",
): Promise<void> {
  return performServiceActionCommand(serviceName, type, "disable", "Disabling");
}

// Helper function to perform service actions using systemctl command
async function performServiceActionCommand(
  serviceName: string,
  type: "system" | "user",
  action: string,
  actionVerb: string,
): Promise<void> {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: `${actionVerb} ${serviceName}...`,
    });

    const userFlag = type === "user" ? "--user" : "";
    const { stderr } = await execAsync(
      `systemctl ${userFlag} ${action} ${serviceName}`,
    );

    // Check for errors in stderr (systemctl often writes to stderr even on success)
    if (stderr && !stderr.includes("Warning:")) {
      throw new Error(stderr.trim());
    }

    await showToast({
      style: Toast.Style.Success,
      title: `Service ${action}`,
      message: `${serviceName} ${action.toLowerCase()} successfully`,
    });
  } catch (error) {
    console.error(`Error ${actionVerb.toLowerCase()} ${serviceName}:`, error);
    await showToast({
      style: Toast.Style.Failure,
      title: `Failed to ${action.toLowerCase()} service`,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// Get service logs using journalctl (D-Bus journal interface may not be available)
export async function getServiceLogs(
  serviceName: string,
  serviceType: "system" | "user" = "system",
  lines: number = 50,
): Promise<string> {
  try {
    const userFlag = serviceType === "user" ? "--user" : "";
    const { stdout } = await execAsync(
      `journalctl ${userFlag} -u ${serviceName} -b -n ${lines} --no-pager`,
    );
    // Strip timestamp and hostname prefixes from each line
    const cleanedLogs = stdout
      .trim()
      .split("\n")
      .map((line) => {
        return line.replace(/^.*\[\d+\]:\s+/, "");
      })
      .filter((line) => line.trim().length > 0)
      .join("\n");

    return cleanedLogs || "No logs available for this service since last boot.";
  } catch (error) {
    console.error(`Error getting logs for ${serviceName}:`, error);
    return `Failed to get logs: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}
