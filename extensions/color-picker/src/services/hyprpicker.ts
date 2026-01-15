import { $ } from "execa";
import { spawn } from "child_process";
import { showToast, Toast } from "@vicinae/api";
import { PickedColor } from "@/types";

export async function isHyprpickerAvailable(): Promise<boolean> {
  try {
    await $`which hyprpicker`;
    return true;
  } catch {
    return false;
  }
}

// Check if hyprpicker is already running (excluding zombie processes)
async function isHyprpickerRunning(): Promise<boolean> {
  try {
    // Get process list with state column (ps -A -o stat,comm)
    // Filter for hyprpicker and exclude lines starting with 'Z' (zombie state)
    const { stdout } = await $`ps -A -o stat,comm`;
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Check if line contains hyprpicker and doesn't start with Z (zombie)
      if (trimmed.includes('hyprpicker') && !trimmed.startsWith('Z')) {
        return true;
      }
    }
    return false;
  } catch (error: any) {
    return false;
  }
}

export async function pickColorFromScreen(): Promise<PickedColor | null> {
  // Check if hyprpicker is already running
  if (await isHyprpickerRunning()) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Color picker already active",
      message: "Please complete or cancel the current color pick first",
    });
    return null;
  }

  // Check if hyprpicker is available
  if (!(await isHyprpickerAvailable())) {
    await showToast({
      style: Toast.Style.Failure,
      title: "hyprpicker is required but not installed",
      message: [
        "Install it:",
        "• Arch Linux: sudo pacman -S hyprpicker",
        "• Fedora: sudo dnf install hyprpicker",
        "• Ubuntu/Debian: sudo apt install hyprpicker",
        "• NixOS: Add hyprpicker to your configuration",
      ].join("\n"),
    });
    return null;
  }

  // Check if running on Wayland
  const isWayland = process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === "wayland";
  if (!isWayland) {
    await showToast({
      style: Toast.Style.Failure,
      title: "hyprpicker requires Wayland",
      message: "You appear to be running X11. hyprpicker may not work correctly.",
    });
    return null;
  }

  try {
      // Execute hyprpicker with hex format and autocopy (with 30 second timeout)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("hyprpicker timed out after 30 seconds")), 30000)
      );

      // Use child_process.spawn directly for better control over process lifecycle
      const pickPromise = new Promise<string>((resolve, reject) => {
        const child = spawn('hyprpicker', ['--format=hex', '--autocopy'], {
          stdio: ['ignore', 'pipe', 'pipe'], // ignore stdin, pipe stdout/stderr
          detached: false,
        });

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => {
          output += data.toString();
        });

        child.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        child.on('exit', (code, signal) => {
          if (code === 0) {
            resolve(output);
          } else if (code === 1) {
            reject({ exitCode: 1, message: 'User cancelled' });
          } else {
            reject(new Error(`hyprpicker exited with code ${code}: ${errorOutput}`));
          }
        });

        child.on('error', (error) => {
          reject(error);
        });
      });

      const stdout = await Promise.race([pickPromise, timeoutPromise]) as string;
      const hex = stdout.trim();

      if (!hex || !hex.startsWith("#")) {
        throw new Error("Invalid color format returned by hyprpicker");
      }

      return { hex };
  } catch (error: any) {
    // Exit code 1 typically means user cancelled (ESC key)
    if (error.exitCode === 1 || error.message === 'User cancelled') {
      return null; // Silent cancellation
    }

    // Show error toast for other failures
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to pick color",
      message: error.message || "Unknown error",
    });
    return null;
  }
}
