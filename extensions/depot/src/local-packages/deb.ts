import { constants } from "node:fs";
import { access } from "node:fs/promises";
import {
  ProcessExecutionError,
  runProcess,
  summarizeProcessOutput,
} from "../utils/process.ts";
import {
  LocalPackageError,
  type LocalDebPackage,
  type LocalInstallOutcome,
} from "./types.ts";
import { parseDebianControl, parseInstalledDebOutput } from "./parsing.ts";

const DPKG_DEB = "/usr/bin/dpkg-deb";
const DPKG_QUERY = "/usr/bin/dpkg-query";
const APT = "/usr/bin/apt";
const PKEXEC = "/usr/bin/pkexec";
const COMMAND_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };
const INSTALLED_FORMAT = "${db:Status-Abbrev}\t${Version}\n";

export async function inspectDebPackage(
  filePath: string,
  fileName: string,
  fileSize: number,
  signal?: AbortSignal,
): Promise<LocalDebPackage> {
  await requireExecutable(DPKG_DEB, "Debian package inspection is not available");

  let result;
  try {
    result = await runProcess(DPKG_DEB, ["--field", filePath], {
      signal,
      env: COMMAND_ENV,
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
): Promise<LocalInstallOutcome> {
  await requireExecutable(APT, "APT installation is not available");
  await requireExecutable(PKEXEC, "Polkit authentication is not available");

  const currentVersion = await installedVersion(pkg.packageId);
  if (currentVersion === pkg.version) return { status: "already-installed" };

  try {
    await runProcess(
      PKEXEC,
      [APT, "--yes", "--no-remove", "install", "--", pkg.filePath],
      { captureStdout: false, maxOutputBytes: 1024 * 1024 },
    );
  } catch (error) {
    if (error instanceof ProcessExecutionError) {
      const details = summarizeProcessOutput(error.result.stderr);
      if (error.result.exitCode === 126) {
        throw new LocalPackageError("cancelled", "Installation was cancelled", details);
      }
      if (error.result.exitCode === 127) {
        throw new LocalPackageError(
          "authentication",
          "Authentication was cancelled or denied",
          details,
        );
      }
      if (/could not get lock|unable to acquire.*lock|is another process using it/i.test(details ?? "")) {
        throw new LocalPackageError(
          "busy",
          "Another package-management operation is currently running",
          details,
        );
      }
      throw new LocalPackageError(
        "failed",
        "Debian package installation failed",
        details,
      );
    }
    throw error;
  }

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
    await access(DPKG_QUERY, constants.X_OK);
  } catch {
    return undefined;
  }
  const result = await runProcess(
    DPKG_QUERY,
    ["--show", `--showformat=${INSTALLED_FORMAT}`, "--", packageId],
    {
      signal,
      allowNonZero: true,
      env: COMMAND_ENV,
      maxOutputBytes: 64 * 1024,
    },
  );
  return parseInstalledDebOutput(result.stdout)?.version;
}

async function requireExecutable(path: string, message: string): Promise<void> {
  try {
    await access(path, constants.X_OK);
  } catch {
    throw new LocalPackageError("unavailable", message);
  }
}
