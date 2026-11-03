import { environment, LocalStorage, showToast, Toast } from "@vicinae/api";
import { exec, spawn } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_MIRROR_OPTIONS } from "./types";
import type {
  ActiveMirrorSession,
  Flip,
  MirrorOptions,
  Output,
  Rotation,
  SavedFormState,
  ScreenMirrorProps,
} from "./types";

export const execAsync = promisify(exec);

const ACTIVE_MIRROR_STORAGE_KEY = "screen_mirror_active_session";
const MIRROR_OPTIONS_STORAGE_KEY = "screen_mirror_last_options";
const MIRROR_FORM_STATE_KEY = "screen_mirror_picker_state";

const REGION_PATTERN = /^(-?\d+),(-?\d+)\s+(\d+)x(\d+)(\s+\S+)?$/;

export async function isWlrRandrInstalled(): Promise<boolean> {
  try {
    await execAsync("which wlr-randr");
    return true;
  } catch {
    return false;
  }
}

export async function isWlMirrorInstalled(): Promise<boolean> {
  try {
    await execAsync("which wl-mirror");
    return true;
  } catch {
    return false;
  }
}

export async function isSlurpInstalled(): Promise<boolean> {
  try {
    await execAsync("which slurp");
    return true;
  } catch {
    return false;
  }
}

export async function getDisplayOutputs(): Promise<Output[]> {
  const { stdout } = await execAsync("wlr-randr --json");
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid output format from wlr-randr");
  }
  return parsed as Output[];
}

export async function isPidRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    const { stdout } = await execAsync(`ps -p ${pid} -o comm=`);
    return stdout.trim().includes("wl-mirror");
  } catch {
    return false;
  }
}

export async function getActiveMirrorSession(): Promise<ActiveMirrorSession | null> {
  try {
    const raw = await LocalStorage.getItem<string>(ACTIVE_MIRROR_STORAGE_KEY);
    if (!raw) return null;
    const session: ActiveMirrorSession = JSON.parse(raw);
    if (session.pid && (await isPidRunning(session.pid))) {
      return session;
    }
    await LocalStorage.removeItem(ACTIVE_MIRROR_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export async function saveMirrorOptions(options: MirrorOptions): Promise<void> {
  await LocalStorage.setItem(
    MIRROR_OPTIONS_STORAGE_KEY,
    JSON.stringify(options),
  );
}

export async function loadMirrorOptions(): Promise<MirrorOptions> {
  try {
    const raw = await LocalStorage.getItem<string>(MIRROR_OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_MIRROR_OPTIONS;
    return { ...DEFAULT_MIRROR_OPTIONS, ...JSON.parse(raw) } as MirrorOptions;
  } catch {
    return DEFAULT_MIRROR_OPTIONS;
  }
}

export async function saveFormState(state: SavedFormState): Promise<void> {
  await LocalStorage.setItem(MIRROR_FORM_STATE_KEY, JSON.stringify(state));
}

/**
 * Read and consume the form state saved before the region picker closed the UI.
 */
export async function loadFormState(): Promise<SavedFormState | null> {
  try {
    const raw = await LocalStorage.getItem<string>(MIRROR_FORM_STATE_KEY);
    if (!raw) return null;
    await LocalStorage.removeItem(MIRROR_FORM_STATE_KEY);
    return JSON.parse(raw) as SavedFormState;
  } catch {
    return null;
  }
}

/**
 * Resolve the exact entrypoint of the currently running extension.
 *
 * Both development and store builds can share the same manifest name, so we use
 * the extension's support directory (which matches its on-disk directory name)
 * to pick the right one from `vicinae cmd ls`.
 */
async function resolveCurrentEntrypoint(
  commandName: string,
): Promise<string | null> {
  const extensionDir = basename(environment.supportPath);

  if (extensionDir && commandName) {
    try {
      const { stdout } = await execAsync("vicinae cmd ls");
      const match = stdout
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.endsWith(`/${extensionDir}:${commandName}`));

      if (match) {
        return match;
      }
    } catch {
      // Fall back to constructing the entrypoint below.
    }

    const owner = environment.ownerOrAuthorName.replace(/^@/, "");
    return `@${owner}/${extensionDir}:${commandName}`;
  }

  return null;
}

/**
 * Reopen one of this extension's commands from scratch. Used after the region
 * picker closes the launcher so the user lands back on the form.
 */
export async function relaunchCurrentCommand(
  commandName: string = environment.commandName,
): Promise<boolean> {
  const entrypoint = await resolveCurrentEntrypoint(commandName);
  if (!entrypoint) return false;

  return new Promise((resolve) => {
    const child = spawn("vicinae", ["cmd", "launch", entrypoint], {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
    child.unref();
  });
}

/**
 * wl-mirror expects flips first, followed by a rotation, e.g. "flipX-90cw".
 * A transform with no flips or rotation is represented as "normal".
 */
export function buildTransform(rotation: Rotation, flip: Flip): string {
  const parts: string[] = [];
  if (flip === "flipX" || flip === "flipY") {
    parts.push(flip);
  }
  if (rotation !== "none") {
    parts.push(rotation);
  }
  return parts.length > 0 ? parts.join("-") : "normal";
}

export function validateRegion(region: string): string | null {
  const trimmed = region.trim();
  if (!trimmed) return null;

  const match = trimmed.match(REGION_PATTERN);
  if (!match) {
    return "Use the slurp format: x,y WxH [output] (for example 0,0 1920x1080 HDMI-A-1)";
  }

  if (Number(match[3]) <= 0 || Number(match[4]) <= 0) {
    return "Region width and height must be greater than zero.";
  }

  return null;
}

/**
 * Extract the optional output name from a slurp/wl-mirror region string.
 */
export function parseRegionOutput(region: string): string | undefined {
  const trimmed = region.trim();
  if (!trimmed) return undefined;

  const parts = trimmed.split(/\s+/);
  return parts.length >= 3 ? parts[2] : undefined;
}

/**
 * Let the user drag a rectangle on screen with slurp.
 * `-o` also exposes whole outputs as clickable presets and `%o` includes
 * the output name in the result.
 */
export function pickRegionWithSlurp(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("slurp", ["-o", "-d", "-f", "%x,%y %wx%h %o"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || "Region selection cancelled."));
        return;
      }

      const region = stdout.trim();
      if (!region) {
        reject(new Error("No region selected."));
        return;
      }

      resolve(region);
    });
  });
}

export function buildWlMirrorArgs({
  source,
  target,
  options,
}: ScreenMirrorProps): string[] {
  const args: string[] = [
    "--fullscreen-output",
    target,
    "--fullscreen",
    "--scaling",
    options.scaling,
  ];

  if (!options.showCursor) {
    args.push("--no-show-cursor");
  }

  const transform = buildTransform(options.rotation, options.flip);
  if (transform !== "normal") {
    args.push("--transform", transform);
  }

  const region = options.region.trim();
  if (region) {
    // When a region is specified, wl-mirror does not take an output argument.
    args.push("--region", region);
  } else {
    args.push(source);
  }

  return args;
}

export async function startScreenMirror({
  source,
  target,
  options,
  setActiveMirror,
}: ScreenMirrorProps): Promise<boolean> {
  let child: ReturnType<typeof spawn> | null = null;
  try {
    const activeSession = await getActiveMirrorSession();
    if (activeSession) {
      return await cancelScreenMirror(setActiveMirror);
    }

    if (!source) {
      showToast({
        style: Toast.Style.Failure,
        title: "Source monitor is required.",
      });
      return false;
    }

    if (!target) {
      showToast({
        style: Toast.Style.Failure,
        title: "Target monitor is required.",
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

    const regionError = validateRegion(options.region);
    if (regionError) {
      showToast({
        style: Toast.Style.Failure,
        title: "Invalid region.",
        message: regionError,
      });
      return false;
    }

    const regionOutput = parseRegionOutput(options.region);
    if (regionOutput && regionOutput === target) {
      showToast({
        style: Toast.Style.Failure,
        title: "Source and destination cannot be the same.",
        message: "The selected region is on the target monitor.",
      });
      return false;
    }

    child = spawn("wl-mirror", buildWlMirrorArgs({ source, target, options }), {
      stdio: "ignore",
      detached: true,
    });

    if (!child.pid) {
      throw new Error("Failed to spawn wl-mirror process.");
    }

    child.unref();

    const session: ActiveMirrorSession = {
      pid: child.pid,
      source,
      target,
      options,
    };

    await LocalStorage.setItem(
      ACTIVE_MIRROR_STORAGE_KEY,
      JSON.stringify(session),
    );
    await saveMirrorOptions(options);
    setActiveMirror?.(session);
    showSuccess("Screen mirroring started successfully.");
    return true;
  } catch (error) {
    if (child?.pid) {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {
        // Process already exited
      }
    }
    handleError("Failed to start screen mirroring.", error);
    setActiveMirror?.(null);
    return false;
  }
}

export async function cancelScreenMirror(
  setActiveMirror?: (session: ActiveMirrorSession | null) => void,
): Promise<boolean> {
  try {
    const session = await getActiveMirrorSession();
    if (!session) {
      setActiveMirror?.(null);
      await LocalStorage.removeItem(ACTIVE_MIRROR_STORAGE_KEY);
      return true;
    }

    if (session.pid) {
      try {
        process.kill(session.pid, "SIGTERM");
      } catch {
        // Process already exited
      }
    }

    await LocalStorage.removeItem(ACTIVE_MIRROR_STORAGE_KEY);
    showSuccess("Screen mirroring stopped successfully.");
    setActiveMirror?.(null);
    return true;
  } catch (error) {
    handleError("Failed to stop screen mirroring.", error);
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
