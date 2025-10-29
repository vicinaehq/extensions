import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  Alert,
  closeMainWindow,
  confirmAlert,
  getPreferenceValues,
  showToast,
  Toast,
} from "@vicinae/api";

const execAsync = promisify(exec);

interface PowerCommandOptions {
  title: string;
  loading: string;
  message: string;
  command: string;
  errorMessage: string;
  interactiveCommand?: string;
}

export async function executePowerCommandWithConfirmation({
  title,
  loading,
  message,
  command,
  errorMessage,
  interactiveCommand,
}: PowerCommandOptions): Promise<void> {
  try {
    const confirmed = await confirmAlert({
      title: `Confirm ${loading}`,
      message,
      primaryAction: {
        title,
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) {
      return;
    }

    const toast = await showToast({
      title: loading,
      style: Toast.Style.Animated,
    });

    try {
      await execAsync(command);
      toast.style = Toast.Style.Success;
      toast.title = `${title} completed`;
    } catch (commandError) {
      // If direct command fails with "Access denied" and we have an interactive fallback, try it
      if (
        interactiveCommand &&
        commandError instanceof Error &&
        commandError.message.includes("Access denied")
      ) {
        console.error("Direct command failed, trying interactive mode");
        await execAsync(interactiveCommand);
        toast.style = Toast.Style.Success;
        toast.title = `${title} completed`;
      } else {
        toast.style = Toast.Style.Failure;
        toast.title = "Error";
        toast.message = `${errorMessage}: ${commandError instanceof Error ? commandError.message : String(commandError)}`;
        throw commandError; // Re-throw to be caught by outer catch
      }
    }

    await closeMainWindow();
  } catch (error) {
    // Only show failure toast if we haven't already updated the loading toast
    if (error) {
      await showToast({
        title: "Error",
        message: `${errorMessage}: ${error instanceof Error ? error.message : String(error)}`,
        style: Toast.Style.Failure,
      });
    }
  }
}

// Predefined power commands
// Dynamic command functions for DE-specific operations
export async function getLockCommand(): Promise<string> {
  const prefs = getPreferenceValues();
  return prefs["lock-command"] || POWER_COMMANDS.LOCK_SCREEN.command;
}

export async function getLogoutCommand(): Promise<string> {
  const prefs = getPreferenceValues();
  return prefs["logout-command"] || POWER_COMMANDS.LOGOUT.command;
}

// Functions to execute dynamic commands
export async function executeLockScreen(): Promise<void> {
  const command = await getLockCommand();
  await executePowerCommandWithConfirmation({
    title: "Lock Screen",
    loading: "Locking screen...",
    message: "This will lock your screen and require authentication to unlock",
    command,
    errorMessage: "Failed to lock screen",
  });
}

export async function executeLogout(): Promise<void> {
  const command = await getLogoutCommand();
  await executePowerCommandWithConfirmation({
    title: "Logout",
    loading: "Logging out...",
    message: "This will end your current session and close all applications",
    command,
    errorMessage: "Failed to logout",
  });
}

export const POWER_COMMANDS = {
  POWEROFF: {
    title: "Power Off",
    loading: "Powering off system...",
    message: "This will shut down your computer immediately",
    command: "systemctl poweroff",
    interactiveCommand: "systemctl poweroff -i",
    errorMessage: "Failed to power off",
  },
  REBOOT: {
    title: "Reboot",
    loading: "Rebooting system...",
    message: "This will restart your computer immediately",
    command: "systemctl reboot",
    interactiveCommand: "systemctl reboot -i",
    errorMessage: "Failed to reboot",
  },
  SUSPEND: {
    title: "Suspend",
    loading: "Suspending system...",
    message: "Putting computer to sleep",
    command: "systemctl suspend",
    interactiveCommand: "systemctl suspend -i",
    errorMessage: "Failed to suspend",
  },
  HIBERNATE: {
    title: "Hibernate",
    loading: "Hibernating system...",
    message: "Saving state to disk and powering off",
    command: "systemctl hibernate",
    interactiveCommand: "systemctl hibernate -i",
    errorMessage: "Failed to hibernate",
  },
  LOGOUT: {
    title: "Logout",
    loading: "Logging out...",
    message: "This will end your current session",
    command: "gnome-session-quit --logout --no-prompt",
    errorMessage: "Failed to logout",
  },
  LOCK_SCREEN: {
    title: "Lock Screen",
    loading: "Locking screen...",
    message: "Securing your session",
    command: "loginctl lock-session",
    errorMessage: "Failed to lock screen",
  },
  REBOOT_UEFI: {
    title: "Reboot to UEFI",
    loading: "Rebooting to UEFI...",
    message: "Restarting to firmware setup",
    command: "systemctl reboot --firmware-setup",
    interactiveCommand: "systemctl reboot --firmware-setup -i",
    errorMessage: "Failed to reboot to UEFI",
  },
  REBOOT_RECOVERY: {
    title: "Reboot to Recovery",
    loading: "Rebooting to Recovery...",
    message: "Restarting to recovery mode",
    command: "systemctl reboot --boot-loader-entry=auto-windows",
    interactiveCommand: "systemctl reboot --boot-loader-entry=auto-windows -i",
    errorMessage: "Failed to reboot to recovery",
  },
} as const;
