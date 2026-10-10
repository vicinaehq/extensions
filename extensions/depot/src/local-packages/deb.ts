import { runAptTransaction } from "../backends/apt-transaction.ts";
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

const { apt: APT, dpkgDeb: DPKG_DEB, dpkgQuery: DPKG_QUERY } =
  LINUX_EXECUTABLES;
const INSTALLED_FORMAT = "${db:Status-Abbrev}\t${Version}\n";

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

  const installed = await installedVersion(fields.packageId, signal);
  return {
    kind: "deb",
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

export async function installDebPackage(
  pkg: LocalDebPackage,
  options?: SoftwareOperationOptions,
): Promise<LocalInstallOutcome> {
  const currentVersion = await installedVersion(pkg.packageId);
  if (currentVersion === pkg.version) return { status: "already-installed" };

  await runAptTransaction({
    aptDaemonRequest: {
      kind: "install-file",
      filePath: pkg.filePath,
      // Inspection and APT's no-removal simulation have already succeeded.
      // This bypasses only aptdaemon's additional package-quality gate.
      force: true,
    },
    directExecutable: APT,
    directArgs: ["--yes", "--no-remove", "install", "--", pkg.filePath],
    simulationArgs: [
      "--simulate",
      "--no-remove",
      "install",
      "--",
      pkg.filePath,
    ],
    unavailableMessage: "APT installation is not available",
    cancelledMessage: "Installation was cancelled",
    failureMessage: "Debian package installation failed",
  }, options);

  const installed = await installedVersion(pkg.packageId);
  if (!installed) {
    throw new LocalPackageError(
      "failed",
      "APT finished, but the package is not installed",
    );
  }
  return { status: "installed" };
}

async function installedVersion(
  packageId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    await requireExecutable(DPKG_QUERY);
  } catch {
    return undefined;
  }
  const result = await runProcess(
    DPKG_QUERY,
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
