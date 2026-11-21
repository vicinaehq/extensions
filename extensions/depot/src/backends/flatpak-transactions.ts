import type {
  FlatpakScope,
  SoftwareItem,
  SoftwareOperationOptions,
  SoftwareUpdate,
} from "../types.ts";
import { C_LOCALE_ENV, runProcess } from "../utils/process.ts";
import {
  FlatpakOperationError,
  assertAppId,
  classifyFlatpakFailure,
} from "./flatpak-common.ts";

/**
 * Runs one non-cancellable Flatpak transaction. Flatpak is never killed to
 * make cancellation look immediate (see SECURITY.md).
 */
export async function runFlatpakTransaction(
  executable: string,
  args: readonly string[],
  failureMessage: string,
  options: SoftwareOperationOptions | undefined,
  statusMessage: string,
): Promise<void> {
  options?.onStatus?.({ message: statusMessage, cancellable: false });
  try {
    await runProcess(executable, args, {
      captureStdout: false,
      env: C_LOCALE_ENV,
      maxOutputBytes: 1024 * 1024,
    });
  } catch (error) {
    throw classifyFlatpakFailure(error, failureMessage);
  }
}

/** Returns the validated scope of an installed-application target. */
export function installedTargetScope(
  pkg: SoftwareItem | SoftwareUpdate,
  failureMessage: string,
): FlatpakScope {
  assertAppId(pkg.id);
  const scope = pkg.flatpak?.scope;
  if (pkg.source !== "flatpak" || !isFlatpakScope(scope)) {
    throw new FlatpakOperationError("not-found", failureMessage);
  }
  return scope;
}

function isFlatpakScope(scope: unknown): scope is FlatpakScope {
  return scope === "user" || scope === "system";
}
