import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { DepotOperationError } from "../errors.ts";
import { LINUX_EXECUTABLES } from "../linux.ts";
import type { SoftwareItem } from "../types.ts";
import {
  C_LOCALE_ENV,
  ProcessExecutionError,
  requireExecutable,
  runProcess,
  summarizeProcessOutput,
} from "./process.ts";

type LaunchErrorKind = "unavailable" | "failed";

class InstalledApplicationLaunchError
  extends DepotOperationError<LaunchErrorKind> {
  constructor(
    kind: LaunchErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super("InstalledApplicationLaunchError", kind, message, technicalDetails);
  }
}

export async function launchInstalledApplication(pkg: SoftwareItem): Promise<void> {
  const filePath = pkg.desktopEntry?.filePath;
  if (!filePath || !isLaunchableDesktopEntryPath(filePath)) {
    throw new InstalledApplicationLaunchError(
      "unavailable",
      "No desktop launcher is available for this application",
    );
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("Desktop entry is not a regular file");
    await requireExecutable(LINUX_EXECUTABLES.gio);
  } catch (error) {
    throw new InstalledApplicationLaunchError(
      "unavailable",
      "The application launcher is no longer available",
      error instanceof Error ? error.message : undefined,
    );
  }

  try {
    await runProcess(
      LINUX_EXECUTABLES.gio,
      ["launch", filePath],
      {
        captureStdout: false,
        env: C_LOCALE_ENV,
        maxOutputBytes: 64 * 1024,
        timeoutMs: 10_000,
      },
    );
  } catch (error) {
    const details = error instanceof ProcessExecutionError
      ? summarizeProcessOutput(error.result.stderr)
      : error instanceof Error
      ? error.message
      : undefined;
    throw new InstalledApplicationLaunchError(
      "failed",
      `Could not launch ${pkg.name}`,
      details,
    );
  }
}

export function isLaunchableDesktopEntryPath(filePath: string): boolean {
  return isAbsolute(filePath) && filePath.endsWith(".desktop");
}
