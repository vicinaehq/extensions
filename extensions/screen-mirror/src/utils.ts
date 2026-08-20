import { showToast, Toast } from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "util";
import { ActiveMirrorSession, ScreenMirrorProps } from "./types";
export const execAsync = promisify(exec);

export async function isWlrRandrInstalled(): Promise<boolean> {
  try {
    await execAsync("wlr-randr");
    return true;
  } catch {
    return false;
  }
}

export async function isWlMirrorInstalled(): Promise<boolean> {
  try {
    await execAsync("wl-mirror --version");
    return true;
  } catch {
    return false;
  }
}

export async function getDisplayOutputs() {
  try {
    const { stdout } = await execAsync("wlr-randr --json");
    return JSON.parse(stdout);
  } catch (error) {
    return {};
  }
}

export async function getActiveMirrorSession(): Promise<ActiveMirrorSession | null> {
  try {
    const { stdout } = await execAsync("ps -C wl-mirror -o args=");
    const lines = stdout.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      if (line.includes("<defunct>")) continue;
      const targetMatch = line.match(/--fullscreen-output\s+([^\s]+)/);
      const target = targetMatch ? targetMatch[1] : undefined;
      const args = line.split(/\s+/);
      const lastArg = args[args.length - 1];
      const source = lastArg && !lastArg.startsWith("-") ? lastArg : undefined;

      if (source && target) {
        return { source, target };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function startScreenMirror({
  source,
  target,
  setActiveMirror,
}: ScreenMirrorProps) {
  try {
    if (await getActiveMirrorSession()) {
      return await cancelScreenMirror(setActiveMirror);
    }

    if (!source || !target) {
      showToast({
        style: Toast.Style.Failure,
        title: "Source and target monitors are required.",
      });
      return false;
    }

    if (source === target) {
      showToast({
        style: Toast.Style.Failure,
        title: "Source and destination cannot be the same.",
      });
      return false;
    }

    setActiveMirror?.({ source, target });

    await execAsync(
      `setsid -f wl-mirror --fullscreen-output ${target} --fullscreen ${source}`,
    );

    return true;
  } catch (error) {
    handleError("Failed to start screen mirroring.", error);
    console.log(error);
    setActiveMirror?.(null);
    return false;
  }
}

export async function cancelScreenMirror(
  setActiveMirror?: (session: ActiveMirrorSession | null) => void,
) {
  try {
    const activeSession = await getActiveMirrorSession();
    if (!activeSession) {
      setActiveMirror?.(null);
      return true;
    }

    await execAsync("pkill -x wl-mirror");
    showSuccess("Screen mirroring stopped successfully.");
    setActiveMirror?.(null);
    return true;
  } catch (error) {
    handleError("Failed to stop screen mirroring.", error);
    console.log(error);
    return false;
  }
}

export function showSuccess(title: string, message?: string) {
  showToast({
    style: Toast.Style.Success,
    title,
    ...(message && { message }),
  });
}

export function handleError(title: string, error: unknown) {
  showToast({
    style: Toast.Style.Failure,
    title,
    message: error instanceof Error ? error.message : "Unknown error",
  });
}
