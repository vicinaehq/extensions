import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FlatpakScope } from "../types.ts";
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
  type LocalFlatpakBundle,
  type LocalFlatpakRef,
  type LocalInstallOutcome,
} from "./types.ts";
import { parseFlatpakBundle, parseFlatpakRef } from "./parsing.ts";

const FLATPAK = LINUX_EXECUTABLES.flatpak;

export async function inspectFlatpakRef(
  filePath: string,
  fileName: string,
  fileSize: number,
  contentHash: string,
  scope: FlatpakScope,
  signal?: AbortSignal,
): Promise<LocalFlatpakRef> {
  if (fileSize > 1024 * 1024) {
    throw new LocalPackageError("invalid", "This Flatpak reference is unexpectedly large");
  }
  const content = await readFile(filePath, "utf8");
  signal?.throwIfAborted();
  const reference = parseFlatpakRef(content);
  if (!reference) {
    throw new LocalPackageError("invalid", "This file is not a valid application Flatpak reference");
  }

  const installed = await getInstalledApp(
    reference.appId,
    scope,
    signal,
    reference.branch,
  );
  return {
    kind: "flatpakref",
    action: flatpakPackageAction(installed),
    filePath,
    fileName,
    fileSize,
    contentHash,
    appId: reference.appId,
    name: reference.name,
    description: "Application reference for a Flatpak repository",
    branch: reference.branch,
    remoteUrl: reference.remoteUrl,
    runtimeRepository: reference.runtimeRepository,
    scope,
    installed: installed !== undefined,
    installedVersion: installed?.version,
  };
}

export async function inspectFlatpakBundle(
  filePath: string,
  fileName: string,
  fileSize: number,
  contentHash: string,
  scope: FlatpakScope,
  signal?: AbortSignal,
): Promise<LocalFlatpakBundle> {
  await requireFlatpak();
  const repository = await mkdtemp(join(tmpdir(), "depot-flatpak-"));
  try {
    for (const directory of [
      "objects",
      "refs/heads",
      "refs/remotes",
      "tmp",
      "state",
      "extensions",
    ]) {
      await mkdir(join(repository, directory), { recursive: true });
    }
    await writeFile(
      join(repository, "config"),
      "[core]\nrepo_version=1\nmode=bare-user-only\n",
      { encoding: "utf8", mode: 0o600 },
    );

    try {
      await runProcess(
        FLATPAK,
        ["build-import-bundle", repository, filePath],
        {
          signal,
          env: C_LOCALE_ENV,
          maxOutputBytes: 512 * 1024,
          timeoutMs: 30_000,
        },
      );
    } catch (error) {
      if (error instanceof ProcessExecutionError) {
        throw new LocalPackageError(
          "invalid",
          "This file is not a valid Flatpak bundle",
          summarizeProcessOutput(error.result.stderr),
        );
      }
      throw error;
    }

    const branches = await runProcess(
      FLATPAK,
      ["repo", "--branches", repository],
      {
        signal,
        env: C_LOCALE_ENV,
        maxOutputBytes: 64 * 1024,
        timeoutMs: 10_000,
      },
    );
    const ref = branches.stdout.split(/\r?\n/).find((line) =>
      line.trim().startsWith("app/")
    )
      ?.split("\t", 1)[0]?.trim();
    if (!ref) {
      throw new LocalPackageError("invalid", "The Flatpak bundle does not contain an application");
    }
    const metadata = await runProcess(
      FLATPAK,
      ["repo", `--metadata=${ref}`, repository],
      {
        signal,
        env: C_LOCALE_ENV,
        maxOutputBytes: 512 * 1024,
        timeoutMs: 10_000,
      },
    );
    const parsed = parseFlatpakBundle(branches.stdout, metadata.stdout);
    if (!parsed) {
      throw new LocalPackageError(
        "invalid",
        "The Flatpak bundle does not contain valid application metadata",
      );
    }

    const installed = await getInstalledApp(
      parsed.appId,
      scope,
      signal,
      parsed.branch,
    );
    return {
      kind: "flatpak-bundle",
      action: flatpakPackageAction(
        installed,
        await readImportedCommit(repository, ref),
      ),
      filePath,
      fileName,
      fileSize,
      contentHash,
      appId: parsed.appId,
      name: parsed.appId,
      description: "Local Flatpak application bundle",
      branch: parsed.branch,
      architecture: parsed.architecture,
      runtime: parsed.runtime,
      downloadSize: parsed.downloadSize,
      installedSize: parsed.installedSize,
      scope,
      installed: installed !== undefined,
      installedVersion: installed?.version,
    };
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

/**
 * Flatpak files carry no comparable application version. A bundle's commit
 * is compared with the installed active commit (which `flatpak list` prints
 * abbreviated), so an identical build is reported as already installed
 * without starting a Flatpak transaction. A reference names a remote whose
 * current commit is unknown offline, so an installed app is offered as an
 * update and `--or-update` lets Flatpak skip it when nothing changed.
 */
export function flatpakPackageAction(
  installed: InstalledFlatpakApp | undefined,
  fileCommit?: string,
): "install" | "update" | "current" {
  if (!installed) return "install";
  const active = installed.activeCommit;
  return fileCommit && active && active.length >= 12 &&
      fileCommit.startsWith(active)
    ? "current"
    : "update";
}

/** Reads the commit `build-import-bundle` recorded for the bundle's ref. */
async function readImportedCommit(
  repository: string,
  ref: string,
): Promise<string | undefined> {
  if (!/^app\/[\w.-]+\/[\w.-]+\/[\w.-]+$/.test(ref) || ref.includes("..")) {
    return undefined;
  }
  const refPath = join(repository, "refs", "heads", ref);
  try {
    const stat = await lstat(refPath);
    if (!stat.isFile() || stat.size > 128) return undefined;
    const commit = (await readFile(refPath, "utf8")).trim();
    return /^[0-9a-f]{64}$/.test(commit) ? commit : undefined;
  } catch {
    return undefined;
  }
}

export async function installFlatpakFile(
  pkg: LocalFlatpakBundle | LocalFlatpakRef,
  options: { executable?: string } = {},
): Promise<LocalInstallOutcome> {
  const executable = options.executable ?? FLATPAK;
  await requireFlatpak(executable);

  const fileOption = pkg.kind === "flatpak-bundle" ? "--bundle" : "--from";
  try {
    await runProcess(
      executable,
      [
        "install",
        scopeFlag(pkg.scope),
        "--noninteractive",
        "--assumeyes",
        "--or-update",
        fileOption,
        pkg.filePath,
      ],
      {
        captureStdout: false,
        env: C_LOCALE_ENV,
        maxOutputBytes: 1024 * 1024,
      },
    );
  } catch (error) {
    if (error instanceof ProcessExecutionError) {
      const details = summarizeProcessOutput(error.result.stderr);
      if (/cancel(?:led|ed)/i.test(details ?? "")) {
        throw new LocalPackageError(
          "cancelled",
          "Installation was cancelled",
          details,
        );
      }
      if (/not authorized|not allowed|permission denied|authentication.*deni/i.test(details ?? "")) {
        throw new LocalPackageError(
          "authentication",
          "Authentication was denied",
          details,
        );
      }
      if (/another.*transaction|already.*running|lock/i.test(details ?? "")) {
        throw new LocalPackageError(
          "busy",
          "Another Flatpak operation is currently running",
          details,
        );
      }
      throw new LocalPackageError("failed", "Flatpak installation failed", details);
    }
    throw error;
  }

  if (!(await getInstalledApp(
    pkg.appId,
    pkg.scope,
    undefined,
    pkg.branch,
    executable,
  ))) {
    throw new LocalPackageError(
      "failed",
      "Flatpak finished, but the application is not installed",
    );
  }
  return { status: "installed" };
}

export interface InstalledFlatpakApp {
  version: string;
  /** Abbreviated active commit as printed by `flatpak list`. */
  activeCommit?: string;
}

async function getInstalledApp(
  appId: string,
  scope: FlatpakScope,
  signal?: AbortSignal,
  branch?: string,
  executable: string = FLATPAK,
): Promise<InstalledFlatpakApp | undefined> {
  try {
    await requireExecutable(executable);
  } catch {
    return undefined;
  }
  const result = await runProcess(
    executable,
    [
      "list",
      scopeFlag(scope),
      "--app",
      "--columns=application,version,branch,active",
    ],
    {
      signal,
      env: C_LOCALE_ENV,
      maxOutputBytes: 512 * 1024,
      timeoutMs: 10_000,
    },
  );
  for (const line of result.stdout.split(/\r?\n/)) {
    const [id, version, installedBranch, active] = line.split("\t");
    if (
      id === appId &&
      (!branch || installedBranch?.trim() === branch)
    ) {
      const activeCommit = active?.trim().toLowerCase();
      return {
        version: version?.trim() || "unknown",
        activeCommit: activeCommit && /^[0-9a-f]+$/.test(activeCommit)
          ? activeCommit
          : undefined,
      };
    }
  }
  return undefined;
}

async function requireFlatpak(executable: string = FLATPAK): Promise<void> {
  try {
    await requireExecutable(executable);
  } catch {
    throw new LocalPackageError("unavailable", "Flatpak is not installed");
  }
}

function scopeFlag(scope: FlatpakScope): "--user" | "--system" {
  return scope === "user" ? "--user" : "--system";
}
