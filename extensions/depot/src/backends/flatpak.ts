import type {
  FlatpakScope,
  PackageBackend,
  SoftwarePackage,
  SoftwareUpdate,
} from "../types";
import {
  ProcessExecutionError,
  runProcess,
} from "../utils/process";
import {
  isValidFlatpakAppId,
  isValidFlatpakRemoteName,
  parseFlatpakInstalledOutput,
  parseFlatpakInstalledApplicationsOutput,
  parseFlatpakUpdatesOutput,
  parseFlatpakRemotesOutput,
  parseFlatpakSearchOutput,
  rankFlatpakSearchResults,
  selectFlatpakSearchScopes,
  selectFlatpakRemote,
  type FlatpakRemote,
  type FlatpakSearchRecord,
  sortFlatpakScopes,
} from "./flatpak-parsing";
import { requireFlatpakExecutable } from "./flatpak-availability";

const FLATPAK = "/usr/bin/flatpak";
const SEARCH_LIMIT = 40;
const SEARCH_CANDIDATE_LIMIT = 400;
const SEARCH_TIMEOUT_MS = 20_000;
const FLATPAK_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };
const ALL_SCOPES: readonly FlatpakScope[] = ["user", "system"];
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_LIMIT = 12;

export type FlatpakErrorKind =
  | "unavailable"
  | "not-found"
  | "cancelled"
  | "network"
  | "failed";

export class FlatpakOperationError extends Error {
  readonly kind: FlatpakErrorKind;
  readonly technicalDetails?: string;

  constructor(
    kind: FlatpakErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super(message);
    this.name = "FlatpakOperationError";
    this.kind = kind;
    this.technicalDetails = technicalDetails;
  }
}

export class FlatpakBackend implements PackageBackend {
  readonly source = "flatpak" as const;
  private readonly executable: string;
  private readonly preferredScope: FlatpakScope;
  private readonly searchCache = new Map<
    string,
    { createdAt: number; records: FlatpakSearchRecord[] }
  >();

  constructor(
    preferredScope: FlatpakScope = "user",
    executable = FLATPAK,
  ) {
    this.executable = executable;
    this.preferredScope = preferredScope;
  }

  async search(query: string, signal?: AbortSignal): Promise<SoftwarePackage[]> {
    await this.requireExecutable();

    const normalizedQuery = query.trim().slice(0, 100);
    if (normalizedQuery.length < 2) return [];

    const [remotes, installed] = await Promise.all([
      this.listRemotes(signal),
      this.listInstalledRecords(signal),
    ]);
    const availableScopes = selectFlatpakSearchScopes(remotes, this.preferredScope);

    if (availableScopes.length === 0) {
      throw new FlatpakOperationError(
        "unavailable",
        "No Flatpak remotes are configured",
      );
    }

    const records = this.getCachedSearch(normalizedQuery)
      ?? await this.searchScopes(normalizedQuery, availableScopes, signal);

    const installedIds = new Set(installed.map((app) => app.id));
    return rankFlatpakSearchResults(
      records,
      normalizedQuery,
      this.preferredScope,
      SEARCH_LIMIT,
    ).flatMap((record) => {
      const remote = selectFlatpakRemote(record.remotes);
      if (!remote) return [];

      return [{
        id: record.id,
        name: record.name,
        description: record.description,
        source: this.source,
        installed: installedIds.has(record.id),
        version: record.version,
        flatpak: {
          remote,
          scope: record.scope,
          branch: record.branch,
        },
      } satisfies SoftwarePackage];
    });
  }

  private async searchScopes(
    query: string,
    scopes: readonly FlatpakScope[],
    signal?: AbortSignal,
  ): Promise<FlatpakSearchRecord[]> {
    const searches = await Promise.allSettled(
      scopes.map(async (scope) => {
        const result = await runProcess(
          this.executable,
          [
            "search",
            scopeFlag(scope),
            "--columns=name,description,application,version,branch,remotes",
            "--",
            query,
          ],
          {
            signal,
            env: FLATPAK_ENV,
            maxLines: SEARCH_CANDIDATE_LIMIT,
            maxOutputBytes: 1024 * 1024,
            timeoutMs: SEARCH_TIMEOUT_MS,
          },
        );
        return parseFlatpakSearchOutput(result.stdout, scope);
      }),
    );

    signal?.throwIfAborted();
    const successful = searches.filter(
      (result): result is PromiseFulfilledResult<FlatpakSearchRecord[]> =>
        result.status === "fulfilled",
    );
    if (successful.length === 0) {
      const firstFailure = searches.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      throw firstFailure?.reason ?? new FlatpakOperationError(
        "failed",
        "Flatpak search failed",
      );
    }

    const records = successful.flatMap((result) => result.value);
    this.searchCache.set(query.toLocaleLowerCase(), {
      createdAt: Date.now(),
      records,
    });
    while (this.searchCache.size > SEARCH_CACHE_LIMIT) {
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.searchCache.delete(oldestKey);
    }
    return records;
  }

  private getCachedSearch(query: string): FlatpakSearchRecord[] | undefined {
    const key = query.toLocaleLowerCase();
    const cached = this.searchCache.get(key);
    if (!cached) return undefined;
    if (Date.now() - cached.createdAt > SEARCH_CACHE_TTL_MS) {
      this.searchCache.delete(key);
      return undefined;
    }

    this.searchCache.delete(key);
    this.searchCache.set(key, cached);
    return cached.records;
  }

  async isInstalled(id: string, signal?: AbortSignal): Promise<boolean> {
    assertAppId(id);
    await this.requireExecutable();
    return (await this.listInstalledRecords(signal)).some((app) => app.id === id);
  }

  async install(pkg: SoftwarePackage): Promise<"installed" | "already-installed"> {
    assertAppId(pkg.id);
    await this.requireExecutable();

    const target = pkg.flatpak;
    if (
      pkg.source !== this.source ||
      !target ||
      (target.scope !== "user" && target.scope !== "system") ||
      !isValidFlatpakRemoteName(target.remote)
    ) {
      throw new FlatpakOperationError("not-found", "Invalid Flatpak install target");
    }

    if (await this.isInstalled(pkg.id)) return "already-installed";

    const remotes = await this.listRemotesForScope(target.scope);
    if (!remotes.some((remote) => remote.name === target.remote)) {
      throw new FlatpakOperationError(
        "not-found",
        `Flatpak remote ${target.remote} is no longer configured`,
      );
    }

    try {
      await runProcess(
        this.executable,
        [
          "install",
          scopeFlag(target.scope),
          "--noninteractive",
          "--assumeyes",
          "--app",
          target.remote,
          pkg.id,
        ],
        { captureStdout: false, maxOutputBytes: 512 * 1024 },
      );
    } catch (error) {
      if (error instanceof ProcessExecutionError) {
        const details = conciseDetails(error.result.stderr);
        if (/cancel(?:led|ed)|not authorized|not allowed/i.test(details ?? "")) {
          throw new FlatpakOperationError(
            "cancelled",
            "Installation or authentication was cancelled",
            details,
          );
        }
        if (/network|resolve|connection|download/i.test(details ?? "")) {
          throw new FlatpakOperationError(
            "network",
            "Network unavailable or Flatpak download failed",
            details,
          );
        }
        throw new FlatpakOperationError(
          "failed",
          "Flatpak installation failed",
          details,
        );
      }
      throw error;
    }

    if (!(await this.isInstalled(pkg.id))) {
      throw new FlatpakOperationError(
        "failed",
        "Flatpak finished, but the application is not installed",
      );
    }

    return "installed";
  }

  async listInstalled(signal?: AbortSignal): Promise<SoftwarePackage[]> {
    await this.requireExecutable();

    const results = await Promise.all(
      ALL_SCOPES.map(async (scope) => {
        const result = await runProcess(
          this.executable,
          [
            "list",
            scopeFlag(scope),
            "--app",
            "--columns=name,description,application,version,branch,origin,installation",
          ],
          { signal, env: FLATPAK_ENV, maxOutputBytes: 512 * 1024 },
        );
        return parseFlatpakInstalledApplicationsOutput(result.stdout, scope);
      }),
    );

    return results
      .flat()
      .map((app) => ({
        id: app.id,
        name: app.name,
        description: app.description,
        source: this.source,
        installed: true,
        version: app.version,
        flatpak: {
          remote: app.remote ?? "unknown",
          scope: app.scope,
          branch: app.branch,
        },
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async remove(pkg: SoftwarePackage): Promise<"removed" | "not-installed"> {
    assertAppId(pkg.id);
    await this.requireExecutable();

    const target = pkg.flatpak;
    if (
      pkg.source !== this.source ||
      !target ||
      (target.scope !== "user" && target.scope !== "system")
    ) {
      throw new FlatpakOperationError("not-found", "Invalid Flatpak removal target");
    }

    const isInstalledInScope = (await this.listInstalledRecords()).some(
      (app) => app.id === pkg.id && app.scope === target.scope,
    );
    if (!isInstalledInScope) return "not-installed";

    try {
      await runProcess(
        this.executable,
        [
          "uninstall",
          scopeFlag(target.scope),
          "--noninteractive",
          "--assumeyes",
          "--app",
          "--",
          pkg.id,
        ],
        { captureStdout: false, maxOutputBytes: 512 * 1024 },
      );
    } catch (error) {
      if (error instanceof ProcessExecutionError) {
        const details = conciseDetails(error.result.stderr);
        if (/cancel(?:led|ed)|not authorized|not allowed/i.test(details ?? "")) {
          throw new FlatpakOperationError(
            "cancelled",
            "Removal or authentication was cancelled",
            details,
          );
        }
        throw new FlatpakOperationError("failed", "Flatpak removal failed", details);
      }
      throw error;
    }

    const stillInstalled = (await this.listInstalledRecords()).some(
      (app) => app.id === pkg.id && app.scope === target.scope,
    );
    if (stillInstalled) {
      throw new FlatpakOperationError(
        "failed",
        "Flatpak finished, but the application is still installed",
      );
    }

    return "removed";
  }

  async listUpdates(signal?: AbortSignal): Promise<SoftwareUpdate[]> {
    await this.requireExecutable();

    const [records, installed] = await Promise.all([
      this.listUpdateRecords(true, signal),
      this.listInstalled(signal),
    ]);
    const installedByScopeAndId = new Map(
      installed.map((pkg) => [
        `${pkg.flatpak?.scope}:${pkg.id}`,
        pkg,
      ]),
    );

    return records.flatMap((record) => {
      const installedPackage = installedByScopeAndId.get(
        `${record.scope}:${record.id}`,
      );
      if (!installedPackage) return [];

      return [{
        id: record.id,
        name: record.name,
        description: record.description,
        source: this.source,
        installed: true,
        currentVersion: installedPackage.version,
        availableVersion: record.availableVersion,
        repository: record.remote,
        downloadSize: record.downloadSize,
        flatpak: {
          remote: record.remote,
          scope: record.scope,
          branch: record.branch,
        },
      } satisfies SoftwareUpdate];
    }).sort((left, right) => left.name.localeCompare(right.name));
  }

  async update(pkg: SoftwareUpdate): Promise<void> {
    assertAppId(pkg.id);
    const target = pkg.flatpak;
    if (
      pkg.source !== this.source ||
      !target ||
      (target.scope !== "user" && target.scope !== "system")
    ) {
      throw new FlatpakOperationError("not-found", "Invalid Flatpak update target");
    }

    const installed = (await this.listInstalledRecords()).some(
      (app) => app.id === pkg.id && app.scope === target.scope,
    );
    if (!installed) {
      throw new FlatpakOperationError("not-found", "Flatpak application is not installed");
    }

    await this.runFlatpakTransaction(
      [
        "update",
        scopeFlag(target.scope),
        "--noninteractive",
        "--assumeyes",
        "--app",
        "--",
        pkg.id,
      ],
      "Flatpak application update failed",
    );
  }

  async updateAll(): Promise<void> {
    const updates = await this.listUpdates();
    for (const scope of ALL_SCOPES) {
      const ids = updates
        .filter((pkg) => pkg.flatpak?.scope === scope)
        .map((pkg) => pkg.id);
      if (ids.length === 0) continue;
      ids.forEach(assertAppId);
      await this.runFlatpakTransaction(
        [
          "update",
          scopeFlag(scope),
          "--noninteractive",
          "--assumeyes",
          "--app",
          "--",
          ...ids,
        ],
        "Flatpak application update failed",
      );
    }
  }

  async refreshMetadata(): Promise<void> {
    await this.requireExecutable();
    await this.listUpdateRecords(false);
  }

  private async listRemotes(signal?: AbortSignal): Promise<FlatpakRemote[]> {
    const results = await Promise.all(
      ALL_SCOPES.map((scope) => this.listRemotesForScope(scope, signal)),
    );
    return results.flat();
  }

  private async listRemotesForScope(
    scope: FlatpakScope,
    signal?: AbortSignal,
  ): Promise<FlatpakRemote[]> {
    const result = await runProcess(
      this.executable,
      ["remotes", scopeFlag(scope), "--columns=name"],
      { signal, env: FLATPAK_ENV, maxOutputBytes: 128 * 1024 },
    );
    return parseFlatpakRemotesOutput(result.stdout, scope);
  }

  private async listInstalledRecords(signal?: AbortSignal) {
    const results = await Promise.all(
      ALL_SCOPES.map(async (scope) => {
        const result = await runProcess(
          this.executable,
          [
            "list",
            scopeFlag(scope),
            "--app",
            "--columns=application,branch,origin,installation",
          ],
          { signal, env: FLATPAK_ENV, maxOutputBytes: 512 * 1024 },
        );
        return parseFlatpakInstalledOutput(result.stdout, scope);
      }),
    );
    return results.flat();
  }

  private async listUpdateRecords(
    cached: boolean,
    signal?: AbortSignal,
  ) {
    const remotes = await this.listRemotes(signal);
    const scopes = sortFlatpakScopes(
      remotes.map((remote) => remote.scope),
      this.preferredScope,
    );
    if (scopes.length === 0) return [];

    const results = await Promise.allSettled(scopes.map(async (scope) => {
      const args = [
        "remote-ls",
        scopeFlag(scope),
        "--updates",
        "--app",
        "--columns=name,description,application,version,branch,origin,download-size",
      ];
      if (cached) args.splice(3, 0, "--cached");
      const result = await runProcess(this.executable, args, {
        signal,
        env: FLATPAK_ENV,
        maxOutputBytes: 1024 * 1024,
        timeoutMs: SEARCH_TIMEOUT_MS,
      });
      return parseFlatpakUpdatesOutput(result.stdout, scope);
    }));

    signal?.throwIfAborted();
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length === results.length || (!cached && failures.length > 0)) {
      throw flatpakUpdateError(failures[0]?.reason);
    }

    return results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
  }

  private async runFlatpakTransaction(
    args: readonly string[],
    failureMessage: string,
  ): Promise<void> {
    await this.requireExecutable();
    try {
      await runProcess(this.executable, args, {
        captureStdout: false,
        maxOutputBytes: 1024 * 1024,
      });
    } catch (error) {
      if (error instanceof ProcessExecutionError) {
        const details = conciseDetails(error.result.stderr);
        if (/cancel(?:led|ed)|not authorized|not allowed/i.test(details ?? "")) {
          throw new FlatpakOperationError(
            "cancelled",
            "Update or authentication was cancelled",
            details,
          );
        }
        if (/network|resolve|connection|download/i.test(details ?? "")) {
          throw new FlatpakOperationError(
            "network",
            "Network unavailable or Flatpak download failed",
            details,
          );
        }
        throw new FlatpakOperationError("failed", failureMessage, details);
      }
      throw error;
    }
  }

  private async requireExecutable(): Promise<void> {
    try {
      await requireFlatpakExecutable(this.executable);
    } catch (error) {
      throw new FlatpakOperationError(
        "unavailable",
        "Flatpak is not installed",
        String(error),
      );
    }
  }
}

function assertAppId(id: string): void {
  if (!isValidFlatpakAppId(id)) {
    throw new FlatpakOperationError("not-found", "Invalid Flatpak application ID");
  }
}

function scopeFlag(scope: FlatpakScope): "--user" | "--system" {
  return scope === "user" ? "--user" : "--system";
}

function conciseDetails(stderr: string): string | undefined {
  const details = stderr.trim().split(/\r?\n/).slice(-8).join("\n");
  return details || undefined;
}

function flatpakUpdateError(error: unknown): FlatpakOperationError {
  if (error instanceof FlatpakOperationError) return error;
  if (error instanceof ProcessExecutionError) {
    const details = conciseDetails(error.result.stderr);
    if (/network|resolve|connection|download/i.test(details ?? "")) {
      return new FlatpakOperationError(
        "network",
        "Network unavailable while refreshing Flatpak metadata",
        details,
      );
    }
    return new FlatpakOperationError(
      "failed",
      "Flatpak update information could not be loaded",
      details,
    );
  }
  return new FlatpakOperationError(
    "failed",
    "Flatpak update information could not be loaded",
    error instanceof Error ? error.message : String(error),
  );
}

export const flatpakBackend = new FlatpakBackend();
