import {
  aptSimulationArgs,
  runAptTransaction,
  type AptTransactionOptions,
} from "../backends/apt-transaction.ts";
import { LINUX_EXECUTABLES } from "../linux.ts";
import {
  C_LOCALE_ENV,
  ProcessExecutionError,
  requireExecutable,
  runProcess,
  summarizeProcessOutput,
} from "../utils/process.ts";
import {
  LocalPackageError,
  type LocalDebPackage,
  type LocalInstallOutcome,
} from "./types.ts";
import type { SoftwareOperationOptions } from "../types.ts";
import { parseDebianControl, parseInstalledDebOutput } from "./parsing.ts";

const { apt: APT, dpkg: DPKG, dpkgDeb: DPKG_DEB, dpkgQuery: DPKG_QUERY } =
  LINUX_EXECUTABLES;
const INSTALLED_FORMAT = "${db:Status-Abbrev}\t${Version}\n";

export type DebPackageAction = "install" | "upgrade" | "downgrade" | "current";

/** Test seams; production always uses the fixed /usr/bin tools. */
export interface DebTools {
  dpkg?: string;
  dpkgQuery?: string;
  runTransaction?: typeof runAptTransaction;
}

export async function inspectDebPackage(
  filePath: string,
  fileName: string,
  fileSize: number,
  contentHash: string,
  signal?: AbortSignal,
): Promise<LocalDebPackage> {
  await requireDebianExecutable(
    DPKG_DEB,
    "Debian package inspection is not available",
  );

  let result;
  try {
    result = await runProcess(DPKG_DEB, ["--field", filePath], {
      signal,
      env: C_LOCALE_ENV,
      maxOutputBytes: 512 * 1024,
      timeoutMs: 10_000,
    });
  } catch (error) {
    if (error instanceof ProcessExecutionError) {
      throw new LocalPackageError(
        "invalid",
        "This file is not a valid Debian package",
        summarizeProcessOutput(error.result.stderr),
      );
    }
    throw error;
  }

  const fields = parseDebianControl(result.stdout);
  if (!fields) {
    throw new LocalPackageError(
      "invalid",
      "Required Debian package metadata is missing or invalid",
    );
  }

  const installed = await installedVersion(fields.packageId, DPKG_QUERY, signal);
  return {
    kind: "deb",
    action: await debPackageAction(installed, fields.version, { signal }),
    filePath,
    fileName,
    fileSize,
    contentHash,
    packageId: fields.packageId,
    name: fields.packageId,
    description: fields.description,
    version: fields.version,
    architecture: fields.architecture,
    homepage: fields.homepage,
    installed: installed !== undefined,
    installedVersion: installed,
  };
}

/** Compares versions with dpkg's own ordering rules (epochs, tildes, revisions). */
export async function debPackageAction(
  installed: string | undefined,
  candidate: string,
  options: { dpkg?: string; signal?: AbortSignal } = {},
): Promise<DebPackageAction> {
  if (installed === undefined) return "install";
  if (installed === candidate) return "current";
  const dpkg = options.dpkg ?? DPKG;
  await requireDebianExecutable(dpkg, "Debian version comparison is not available");
  const compare = async (relation: "lt" | "eq") => {
    const result = await runProcess(
      dpkg,
      ["--compare-versions", candidate, relation, installed],
      {
        signal: options.signal,
        allowNonZero: true,
        env: C_LOCALE_ENV,
        maxOutputBytes: 16 * 1024,
        timeoutMs: 5_000,
      },
    );
    if (result.exitCode === 0 || result.exitCode === 1) return result.exitCode === 0;
    throw new LocalPackageError(
      "invalid",
      "The package version could not be compared with the installed version",
      summarizeProcessOutput(result.stderr),
    );
  };
  if (await compare("lt")) return "downgrade";
  return await compare("eq") ? "current" : "upgrade";
}

export function debDowngradeMessage(pkg: LocalDebPackage): string {
  return `${pkg.packageId} ${pkg.installedVersion ?? ""} is newer than this file ` +
    `(${pkg.version}). Depot does not downgrade packages; remove the installed ` +
    "version first if you need this one.";
}

/** APT only treats arguments ending in .deb as local archives. */
export function debInstallTransaction(filePath: string): AptTransactionOptions {
  if (!filePath.endsWith(".deb")) {
    throw new LocalPackageError("failed", "Staged Debian package path must end in .deb");
  }
  const directArgs = ["--yes", "--no-remove", "install", "--", filePath];
  return {
    // aptdaemon rejects files staged by an extension even when APT can read
    // them. Use APT's normal Polkit path for local files; repository package
    // transactions can continue to use aptdaemon.
    directExecutable: APT,
    directArgs,
    simulationArgs: aptSimulationArgs(directArgs),
    unavailableMessage: "APT installation is not available",
    cancelledMessage: "Installation was cancelled",
    failureMessage: "Debian package installation failed",
  };
}

export async function installDebPackage(
  pkg: LocalDebPackage,
  options?: SoftwareOperationOptions,
  tools: DebTools = {},
): Promise<LocalInstallOutcome> {
  // Package state may have changed since review; recheck before authenticating.
  const dpkgQuery = tools.dpkgQuery ?? DPKG_QUERY;
  const installedBefore = await installedVersion(pkg.packageId, dpkgQuery);
  const action = await debPackageAction(installedBefore, pkg.version, {
    dpkg: tools.dpkg,
  });
  if (action === "current") return { status: "already-installed" };
  if (action === "downgrade") {
    throw new LocalPackageError(
      "invalid",
      debDowngradeMessage({ ...pkg, installedVersion: installedBefore }),
    );
  }

  const runTransaction = tools.runTransaction ?? runAptTransaction;
  await runTransaction(debInstallTransaction(pkg.filePath), options);

  if (await installedVersion(pkg.packageId, dpkgQuery) !== pkg.version) {
    throw new LocalPackageError(
      "failed",
      `APT finished, but ${pkg.packageId} ${pkg.version} is not installed`,
    );
  }
  return { status: "installed" };
}

async function installedVersion(
  packageId: string,
  dpkgQuery: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    await requireExecutable(dpkgQuery);
  } catch {
    return undefined;
  }
  const result = await runProcess(
    dpkgQuery,
    ["--show", `--showformat=${INSTALLED_FORMAT}`, "--", packageId],
    {
      signal,
      allowNonZero: true,
      env: C_LOCALE_ENV,
      maxOutputBytes: 64 * 1024,
    },
  );
  return parseInstalledDebOutput(result.stdout)?.version;
}

async function requireDebianExecutable(
  path: string,
  message: string,
): Promise<void> {
  try {
    await requireExecutable(path);
  } catch {
    throw new LocalPackageError("unavailable", message);
  }
}
