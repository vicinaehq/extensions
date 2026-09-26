import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FlatpakScope } from "../types";
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

  const installedVersion = await getInstalledVersion(reference.appId, scope, signal);
  return {
    kind: "flatpakref",
    filePath,
    fileName,
    fileSize,
    appId: reference.appId,
    name: reference.name,
    description: "Application reference for a Flatpak repository",
    branch: reference.branch,
    remoteUrl: reference.remoteUrl,
    runtimeRepository: reference.runtimeRepository,
    scope,
    installed: installedVersion !== undefined,
    installedVersion,
  };
}

export async function inspectFlatpakBundle(
  filePath: string,
  fileName: string,
  fileSize: number,
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

    const installedVersion = await getInstalledVersion(parsed.appId, scope, signal);
    return {
      kind: "flatpak-bundle",
      filePath,
      fileName,
      fileSize,
      appId: parsed.appId,
      name: parsed.appId,
      description: "Local Flatpak application bundle",
      branch: parsed.branch,
      architecture: parsed.architecture,
      runtime: parsed.runtime,
      downloadSize: parsed.downloadSize,
      installedSize: parsed.installedSize,
      scope,
      installed: installedVersion !== undefined,
      installedVersion,
    };
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
}

export async function installFlatpakFile(
  pkg: LocalFlatpakBundle | LocalFlatpakRef,
): Promise<LocalInstallOutcome> {
  await requireFlatpak();
  if (await getInstalledVersion(pkg.appId, pkg.scope)) {
    return { status: "already-installed" };
  }

  const fileOption = pkg.kind === "flatpak-bundle" ? "--bundle" : "--from";
  try {
    await runProcess(
      FLATPAK,
      [
        "install",
        scopeFlag(pkg.scope),
        "--noninteractive",
        "--assumeyes",
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
      if (/cancel(?:led|ed)|not authorized|not allowed/i.test(details ?? "")) {
        throw new LocalPackageError(
          "cancelled",
          "Installation or authentication was cancelled",
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

  if (!(await getInstalledVersion(pkg.appId, pkg.scope))) {
    throw new LocalPackageError(
      "failed",
      "Flatpak finished, but the application is not installed",
    );
  }
  return { status: "installed" };
}

async function getInstalledVersion(
  appId: string,
  scope: FlatpakScope,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    await requireExecutable(FLATPAK);
  } catch {
    return undefined;
  }
  const result = await runProcess(
    FLATPAK,
    ["list", scopeFlag(scope), "--app", "--columns=application,version"],
    {
      signal,
      env: C_LOCALE_ENV,
      maxOutputBytes: 512 * 1024,
      timeoutMs: 10_000,
    },
  );
  for (const line of result.stdout.split(/\r?\n/)) {
    const [id, version] = line.split("\t");
    if (id === appId) return version?.trim() || "unknown";
  }
  return undefined;
}

async function requireFlatpak(): Promise<void> {
  try {
    await requireExecutable(FLATPAK);
  } catch {
    throw new LocalPackageError("unavailable", "Flatpak is not installed");
  }
}

function scopeFlag(scope: FlatpakScope): "--user" | "--system" {
  return scope === "user" ? "--user" : "--system";
}
