import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { userDataDirectory } from "../linux.ts";
import type { FlatpakScope, SoftwareItem } from "../types.ts";
import {
  C_LOCALE_ENV,
  requireCompleteOutput,
  runProcess,
  summarizeProcessOutput,
} from "../utils/process.ts";
import {
  parseFlatpakUnusedPreview,
  type FlatpakCleanupItem,
} from "./cleanup-parsing.ts";
import {
  ALL_SCOPES,
  FlatpakOperationError,
  classifyFlatpakFailure,
  scopeFlag,
} from "./flatpak-common.ts";
import {
  parseFlatpakInstalledApplicationsOutput,
  parseFlatpakInstalledOutput,
  parseFlatpakRemotesOutput,
  parseFlatpakUpdatesOutput,
  type FlatpakRemote,
  type FlatpakUpdateRecord,
  type InstalledFlatpak,
} from "./flatpak-parsing.ts";

const LIST_TIMEOUT_MS = 10_000;
const REMOTE_TIMEOUT_MS = 20_000;

export async function listFlatpakRemotes(
  executable: string,
): Promise<FlatpakRemote[]> {
  const results = await Promise.all(ALL_SCOPES.map(async (scope) => {
    const args = ["remotes", scopeFlag(scope), "--columns=name"];
    const result = await runProcess(executable, args, {
      env: C_LOCALE_ENV,
      maxOutputBytes: 128 * 1024,
      timeoutMs: LIST_TIMEOUT_MS,
    });
    return parseFlatpakRemotesOutput(
      requireCompleteOutput(executable, result).stdout,
      scope,
    );
  }));
  return results.flat();
}

export async function listInstalledFlatpaks(
  executable: string,
): Promise<InstalledFlatpak[]> {
  const results = await Promise.all(ALL_SCOPES.map(async (scope) => {
    const result = await runProcess(
      executable,
      ["list", scopeFlag(scope), "--app", "--columns=application,branch,origin,installation"],
      { env: C_LOCALE_ENV, maxOutputBytes: 512 * 1024, timeoutMs: LIST_TIMEOUT_MS },
    );
    return parseFlatpakInstalledOutput(
      requireCompleteOutput(executable, result).stdout,
      scope,
    );
  }));
  return results.flat();
}

/** Installed applications with presentation metadata for Update and Manage. */
export async function listInstalledFlatpakApplications(
  executable: string,
  signal?: AbortSignal,
): Promise<SoftwareItem[]> {
  const results = await Promise.all(ALL_SCOPES.map(async (scope) => {
    const desktopDirectory = flatpakDesktopDirectory(scope);
    const [result, desktopFiles] = await Promise.all([
      runProcess(
        executable,
        [
          "list",
          scopeFlag(scope),
          "--app",
          "--columns=name,description,application,version,branch,origin,installation",
        ],
        { signal, env: C_LOCALE_ENV, maxOutputBytes: 512 * 1024 },
      ),
      listDesktopFiles(desktopDirectory),
    ]);
    const { stdout } = requireCompleteOutput(executable, result);
    return parseFlatpakInstalledApplicationsOutput(stdout, scope)
      .map((app): SoftwareItem => {
        const desktopId = `${app.id}.desktop`;
        const hasDesktopEntry = desktopFiles.has(desktopId);
        return {
          id: app.id,
          name: app.name,
          description: app.description,
          source: "flatpak",
          installed: true,
          version: app.version,
          appstream: {
            componentId: app.id,
            kind: hasDesktopEntry ? "desktop-application" : "unknown",
            isGuiApplication: hasDesktopEntry,
          },
          flatpak: {
            remote: app.remote ?? "unknown",
            scope: app.scope,
            branch: app.branch,
          },
          desktopEntry: hasDesktopEntry
            ? { id: desktopId, filePath: join(desktopDirectory, desktopId) }
            : undefined,
          installationPath: join(flatpakInstallationDirectory(app.scope), app.id),
        };
      });
  }));

  return results.flat().sort((left, right) => left.name.localeCompare(right.name));
}

export async function listFlatpakUpdateRecords(
  executable: string,
  scopes: readonly FlatpakScope[],
  cached: boolean,
  signal?: AbortSignal,
): Promise<FlatpakUpdateRecord[]> {
  if (scopes.length === 0) return [];

  const results = await Promise.allSettled(scopes.map(async (scope) => {
    const args = [
      "remote-ls",
      scopeFlag(scope),
      ...(cached ? ["--cached"] : []),
      "--updates",
      "--app",
      "--columns=name,description,application,version,branch,origin,download-size",
    ];
    const result = await runProcess(executable, args, {
      signal,
      env: C_LOCALE_ENV,
      maxOutputBytes: 1024 * 1024,
      timeoutMs: REMOTE_TIMEOUT_MS,
    });
    return parseFlatpakUpdatesOutput(
      requireCompleteOutput(executable, result).stdout,
      scope,
    );
  }));

  signal?.throwIfAborted();
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length > 0) {
    throw classifyFlatpakFailure(
      failures[0]?.reason,
      "Flatpak update information could not be loaded",
    );
  }

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
}

export async function previewFlatpakCleanup(
  executable: string,
  signal?: AbortSignal,
): Promise<FlatpakCleanupItem[]> {
  const results = await Promise.all(ALL_SCOPES.map(async (scope) => {
    const result = await runProcess(
      executable,
      ["uninstall", scopeFlag(scope), "--unused"],
      {
        signal,
        allowNonZero: true,
        input: "n\n",
        env: C_LOCALE_ENV,
        maxOutputBytes: 1024 * 1024,
      },
    );
    // A cut-off preview would under-report what cleanup removes.
    requireCompleteOutput(executable, result);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const items = parseFlatpakUnusedPreview(output, scope);
    if (items.length === 0 && !/nothing unused to uninstall/i.test(output)) {
      throw new FlatpakOperationError(
        "failed",
        `Flatpak ${scope} cleanup could not be inspected safely`,
        summarizeProcessOutput(output),
      );
    }
    if (items.length === 0) return [];
    const installed = requireCompleteOutput(executable, await runProcess(
      executable,
      ["list", scopeFlag(scope), "--runtime", "--columns=ref"],
      { signal, env: C_LOCALE_ENV, maxOutputBytes: 1024 * 1024 },
    )).stdout.trim().split(/\r?\n/).map((ref) =>
      ref.startsWith("runtime/") ? ref : `runtime/${ref}`
    );
    return items.map((item) => {
      const matches = installed.filter((ref) => {
        const parts = ref.split("/");
        return parts.length === 4 && parts[0] === "runtime" &&
          parts[1] === item.id && parts[3] === item.branch &&
          parts.every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part));
      });
      if (matches.length !== 1) {
        throw new FlatpakOperationError(
          "failed", "Flatpak cleanup runtime could not be identified safely", item.id,
        );
      }
      return { ...item, ref: matches[0]! };
    });
  }));
  signal?.throwIfAborted();
  return results.flat();
}

function flatpakDesktopDirectory(scope: FlatpakScope): string {
  const root = scope === "user" ? userDataDirectory() : "/var/lib";
  return join(root, "flatpak", "exports", "share", "applications");
}

function flatpakInstallationDirectory(scope: FlatpakScope): string {
  const root = scope === "user" ? userDataDirectory() : "/var/lib";
  return join(root, "flatpak", "app");
}

async function listDesktopFiles(directory: string): Promise<Set<string>> {
  try {
    return new Set(
      (await readdir(directory)).filter((name) => name.endsWith(".desktop")),
    );
  } catch {
    return new Set();
  }
}
