import {
  DepotOperationError,
  describeOperationError,
  isOperationCancelled,
  operationErrorMessage,
} from "./errors.ts";
import {
  resolvedBundlePackage,
  unresolvedBundlePackage,
  type BundlePackage,
  type ResolvedBundlePackage,
  type SoftwareBundle,
} from "./package-bundles.ts";
import {
  recentActionSource,
  type NewRecentAction,
} from "./recent-actions.ts";
import type {
  SoftwareInstallBatchOutcome,
  SoftwareItem,
  SoftwareOperationOptions,
  SoftwareSource,
} from "./types.ts";
import type { OperationFeedback } from "./utils/operation-feedback.ts";
import { isProcessAborted } from "./utils/process.ts";

const RESOLUTION_BATCH_SIZE = 6;
const SOURCES: readonly SoftwareSource[] = ["apt", "flatpak"];

interface BatchInstaller {
  installMany(
    packages: readonly SoftwareItem[],
    options?: SoftwareOperationOptions,
  ): Promise<SoftwareInstallBatchOutcome>;
}

export interface BundleBackends {
  apt: BatchInstaller & {
    getDetails(id: string, signal?: AbortSignal): Promise<SoftwareItem>;
  };
  flatpak: BatchInstaller & {
    resolvePackageIds(
      requests: readonly { id: string }[],
      signal?: AbortSignal,
    ): Promise<Map<string, SoftwareItem>>;
  };
}

export function bundlePackageKey(entry: BundlePackage): string {
  return `${entry.source}:${entry.id}`;
}

export async function resolveBundle(
  bundle: SoftwareBundle,
  backends: BundleBackends,
  enabled: { aptEnabled: boolean; flatpakEnabled: boolean },
  signal: AbortSignal,
): Promise<ResolvedBundlePackage[]> {
  const aptEntries = bundle.packages.filter((entry) => entry.source === "apt");
  const flatpakEntries = bundle.packages.filter((entry) => entry.source === "flatpak");
  const [aptPackages, flatpakPackages] = await Promise.all([
    enabled.aptEnabled
      ? resolveAptPackages(aptEntries, backends.apt, signal)
      : disabledPackages(aptEntries, "APT"),
    enabled.flatpakEnabled
      ? resolveFlatpakPackages(flatpakEntries, backends.flatpak, signal)
      : disabledPackages(flatpakEntries, "Flatpak"),
  ]);
  const resolved = new Map(
    [...aptPackages, ...flatpakPackages].map((item) => [
      bundlePackageKey(item.entry),
      item,
    ]),
  );

  signal.throwIfAborted();
  return bundle.packages.map((entry) =>
    resolved.get(bundlePackageKey(entry)) ?? resolvedBundlePackage(
      entry,
      undefined,
      "Package status is unavailable",
    )
  );
}

function disabledPackages(
  entries: readonly BundlePackage[],
  label: string,
): ResolvedBundlePackage[] {
  return entries.map((entry) => unresolvedBundlePackage(
    entry,
    "unsupported",
    `${label} is disabled in Depot preferences`,
  ));
}

async function resolveAptPackages(
  entries: readonly BundlePackage[],
  backend: BundleBackends["apt"],
  signal: AbortSignal,
): Promise<ResolvedBundlePackage[]> {
  const resolved: ResolvedBundlePackage[] = [];
  for (const batch of chunks(entries, RESOLUTION_BATCH_SIZE)) {
    const results = await Promise.allSettled(
      batch.map((entry) => backend.getDetails(entry.id, signal)),
    );
    results.forEach((result, index) => {
      const entry = batch[index]!;
      resolved.push(
        result.status === "fulfilled"
          ? resolvedBundlePackage(entry, result.value)
          : unresolvedBundlePackage(
            entry,
            isBackendUnavailable(result.reason) ? "unsupported" : "unavailable",
            operationErrorMessage(result.reason, "Not available from APT"),
          ),
      );
    });
  }
  signal.throwIfAborted();
  return resolved;
}

async function resolveFlatpakPackages(
  entries: readonly BundlePackage[],
  backend: BundleBackends["flatpak"],
  signal: AbortSignal,
): Promise<ResolvedBundlePackage[]> {
  if (entries.length === 0) return [];

  try {
    const packages = await backend.resolvePackageIds(
      entries.map((entry) => ({ id: entry.id })),
      signal,
    );
    return entries.map((entry) => resolvedBundlePackage(
      entry,
      packages.get(entry.id),
      "Not available from configured Flatpak remotes",
    ));
  } catch (error) {
    if (isProcessAborted(error)) throw error;
    const message = operationErrorMessage(
      error,
      "Flatpak package information is unavailable",
    );
    const status = isBackendUnavailable(error) ? "unsupported" : "unavailable";
    return entries.map((entry) =>
      unresolvedBundlePackage(entry, status, message)
    );
  }
}

function isBackendUnavailable(error: unknown): boolean {
  return error instanceof DepotOperationError && error.kind === "unavailable";
}

export interface BundleBatchFailure {
  source: SoftwareSource;
  packages: SoftwareItem[];
  /** The backend error, re-labelled with the backend name. */
  error: DepotOperationError<string>;
}

export interface BundleInstallResult {
  requested: number;
  installed: SoftwareItem[];
  alreadyInstalled: SoftwareItem[];
  /** Packages a finished transaction did not install. */
  missing: SoftwareItem[];
  failures: BundleBatchFailure[];
  cancelled: boolean;
}

/**
 * Installs one batch per backend. A failed batch does not stop the other
 * backend; a cancellation stops the remaining batches but keeps the results
 * of batches that already completed.
 */
export async function installBundlePackages(
  targets: readonly SoftwareItem[],
  backends: BundleBackends,
  options?: SoftwareOperationOptions,
): Promise<BundleInstallResult> {
  const result: BundleInstallResult = {
    requested: targets.length,
    installed: [],
    alreadyInstalled: [],
    missing: [],
    failures: [],
    cancelled: false,
  };

  for (const source of SOURCES) {
    const packages = targets.filter((pkg) => pkg.source === source);
    if (packages.length === 0 || result.cancelled) continue;
    try {
      const outcome = await backends[source].installMany(packages, options);
      const installed = new Set(outcome.installedIds);
      const alreadyInstalled = new Set(outcome.alreadyInstalledIds);
      const notInstalled: SoftwareItem[] = [];
      for (const pkg of packages) {
        if (installed.has(pkg.id)) result.installed.push(pkg);
        else if (alreadyInstalled.has(pkg.id)) result.alreadyInstalled.push(pkg);
        // Reported missingIds, and anything the backend did not account for.
        else notInstalled.push(pkg);
      }
      if (outcome.failure !== undefined && notInstalled.length > 0) {
        // A later transaction failed after earlier ones succeeded.
        result.failures.push({
          source,
          packages: notInstalled,
          error: namedBatchError(source, outcome.failure),
        });
      } else {
        result.missing.push(...notInstalled);
      }
    } catch (error) {
      if (isOperationCancelled(error)) {
        result.cancelled = true;
      } else {
        result.failures.push({
          source,
          packages,
          error: namedBatchError(source, error),
        });
      }
    }
  }
  return result;
}

function namedBatchError(
  source: SoftwareSource,
  error: unknown,
): DepotOperationError<string> {
  const label = recentActionSource(source);
  const failure = describeOperationError(error, "Installation failed");
  return new DepotOperationError(
    "BundleBatchError",
    error instanceof DepotOperationError ? error.kind : "failed",
    `${label}: ${failure.message}`,
    failure.details,
  );
}

/** The Recent Actions identity of a failed backend batch. */
export function batchFailureRecord(
  bundleName: string,
  failure: BundleBatchFailure,
): Pick<NewRecentAction, "name" | "identifier" | "source"> {
  return {
    name: bundleName,
    identifier: failure.packages.map((pkg) => pkg.id).join(" "),
    source: recentActionSource(failure.source),
  };
}

/** A failure that should be reported on its own, with its technical details. */
export function soleBatchFailure(
  result: BundleInstallResult,
): BundleBatchFailure | undefined {
  return result.failures.length === 1 &&
      result.installed.length === 0 &&
      result.alreadyInstalled.length === 0 &&
      result.missing.length === 0 &&
      !result.cancelled
    ? result.failures[0]
    : undefined;
}

export function bundleRecentActions(
  bundleName: string,
  result: BundleInstallResult,
): NewRecentAction[] {
  return [
    ...result.installed.map((pkg) => ({
      kind: "installed" as const,
      name: pkg.name,
      identifier: pkg.id,
      source: recentActionSource(pkg.source),
    })),
    ...result.missing.map((pkg) => ({
      kind: "failed" as const,
      name: pkg.name,
      identifier: pkg.id,
      source: recentActionSource(pkg.source),
      summary: `${recentActionSource(pkg.source)} finished without installing ${pkg.id}`,
    })),
    ...result.failures.map((failure) => ({
      ...batchFailureRecord(bundleName, failure),
      kind: "failed" as const,
      summary: failure.error.message,
      details: failure.error.technicalDetails,
    })),
  ];
}

export function bundleInstallFeedback(
  bundleName: string,
  result: BundleInstallResult,
): OperationFeedback {
  const done = result.installed.length + result.alreadyInstalled.length;
  if (done === result.requested) {
    return {
      status: "success",
      title: `${bundleName} installed`,
      message: `${result.installed.length} package${result.installed.length === 1 ? "" : "s"} installed`,
    };
  }

  const notInstalled = [
    ...result.missing,
    ...result.failures.flatMap((failure) => failure.packages),
  ].map((pkg) => pkg.id);
  const hasDetails = result.missing.length > 0 || result.failures.length > 0;
  return {
    status: "failure",
    title: done > 0
      ? `${bundleName} partially installed: ${done} of ${result.requested}`
      : `${bundleName} was not installed`,
    message: [
      result.cancelled ? "Installation was cancelled." : undefined,
      ...result.failures.map((failure) => `${failure.error.message}.`),
      notInstalled.length > 0
        ? `Not installed: ${idList(notInstalled)}.`
        : undefined,
      hasDetails ? "Details in Recent Actions" : undefined,
    ].filter(Boolean).join(" "),
  };
}

function idList(ids: readonly string[], limit = 5): string {
  const visible = ids.slice(0, limit).join(", ");
  return ids.length > limit ? `${visible} and ${ids.length - limit} more` : visible;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
