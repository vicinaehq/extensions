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
import { flatpakInstallKey, isValidFlatpakRemoteName } from "./flatpak-parsing.ts";

export interface FlatpakInstallTarget {
  pkg: SoftwareItem;
  scope: FlatpakScope;
  remote: string;
  key: string;
}

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

/** Validates install targets and removes duplicates by scope and ID. */
export function flatpakInstallTargets(
  packages: readonly SoftwareItem[],
): FlatpakInstallTarget[] {
  const unique = new Map<string, FlatpakInstallTarget>();
  for (const pkg of packages) {
    assertAppId(pkg.id);
    const target = pkg.flatpak;
    if (
      pkg.source !== "flatpak" ||
      !target ||
      !isFlatpakScope(target.scope) ||
      !isValidFlatpakRemoteName(target.remote)
    ) {
      throw new FlatpakOperationError("not-found", "Invalid Flatpak install target");
    }
    const key = flatpakInstallKey(target.scope, pkg.id);
    unique.set(key, { pkg, scope: target.scope, remote: target.remote, key });
  }
  return [...unique.values()];
}

/**
 * Keeps one target per application ID, preferring the scope where it is
 * already installed so a duplicate request cannot add a second copy.
 */
export function preferInstalledTargets(
  targets: readonly FlatpakInstallTarget[],
  installedKeys: ReadonlySet<string>,
): FlatpakInstallTarget[] {
  const unique = new Map<string, FlatpakInstallTarget>();
  for (const target of targets) {
    const existing = unique.get(target.pkg.id);
    if (!existing || (installedKeys.has(target.key) && !installedKeys.has(existing.key))) {
      unique.set(target.pkg.id, target);
    }
  }
  return [...unique.values()];
}

/** One transaction per scope and remote keeps Flatpak's dependency solving. */
export function groupInstallTargets(
  targets: readonly FlatpakInstallTarget[],
): FlatpakInstallTarget[][] {
  const groups = new Map<string, FlatpakInstallTarget[]>();
  for (const target of targets) {
    const key = `${target.scope}:${target.remote}`;
    groups.set(key, [...(groups.get(key) ?? []), target]);
  }
  return [...groups.values()];
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
