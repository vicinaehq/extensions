import type {
  FlatpakScope,
  SoftwareInstallBatchOutcome,
  SoftwareItem,
  SoftwareOperationOptions,
  SoftwareUpdate,
} from "../types.ts";
import { isOperationCancelled } from "../errors.ts";
import { LINUX_EXECUTABLES } from "../linux.ts";
import { requireExecutable } from "../utils/process.ts";
import type { FlatpakCleanupItem } from "./cleanup-parsing.ts";
import {
  ALL_SCOPES,
  FlatpakOperationError,
  assertAppId,
  isFlatpakUnavailable,
  scopeFlag,
} from "./flatpak-common.ts";
import {
  listFlatpakRemotes,
  listFlatpakUpdateRecords,
  listInstalledFlatpakApplications,
  listInstalledFlatpaks,
  previewFlatpakCleanup,
} from "./flatpak-listing.ts";
import {
  flatpakInstallKey,
  isValidFlatpakRemoteName,
  selectFlatpakSearchScopes,
  sortFlatpakScopes,
  type InstalledFlatpak,
} from "./flatpak-parsing.ts";
import {
  FlatpakSearchCache,
  flatpakSearchItems,
  searchFlatpakScopes,
} from "./flatpak-search.ts";
import {
  flatpakInstallTargets,
  groupInstallTargets,
  installedTargetScope,
  preferInstalledTargets,
  runFlatpakTransaction,
} from "./flatpak-transactions.ts";

export {
  FlatpakOperationError,
  isFlatpakUnavailable,
  type FlatpakErrorKind,
} from "./flatpak-common.ts";

const QUERY_LENGTH_LIMIT = 100;
const RESOLVE_BATCH_SIZE = 4;

export interface FlatpakSearchResponse {
  items: SoftwareItem[];
  warning?: string;
}

export interface FlatpakPackageRequest {
  id: string;
  remote?: string;
}

/**
 * Flatpak CLI adapter. One instance belongs to one open command: remotes and
 * the installed set are loaded lazily once and refreshed after transactions.
 */
export class FlatpakBackend {
  private readonly executable: string;
  private readonly preferredScope: FlatpakScope;
  private readonly searchCache = new FlatpakSearchCache();
  private readonly remotes = cachedLoader(() => listFlatpakRemotes(this.executable));
  private readonly installedRecords = cachedLoader(() =>
    listInstalledFlatpaks(this.executable)
  );

  constructor(
    preferredScope: FlatpakScope = "user",
    executable = LINUX_EXECUTABLES.flatpak,
  ) {
    this.executable = executable;
    this.preferredScope = preferredScope;
  }

  /** False when Flatpak is not installed or has no remotes configured. */
  async isAvailable(): Promise<boolean> {
    try {
      await this.requireExecutable();
      return (await this.remotes()).length > 0;
    } catch (error) {
      // Other failures surface through search, which reports them.
      return !isFlatpakUnavailable(error);
    }
  }

  /** Searches configured remotes. An absent Flatpak yields no results. */
  async searchWithStatus(
    query: string,
    signal?: AbortSignal,
  ): Promise<FlatpakSearchResponse> {
    const normalizedQuery = query.trim().slice(0, QUERY_LENGTH_LIMIT);
    if (normalizedQuery.length < 2) return { items: [] };

    try {
      await this.requireExecutable();
      // The installed set loads in parallel with the scope searches.
      const installed = this.installedRecords();
      const scopes = selectFlatpakSearchScopes(
        await this.remotes(),
        this.preferredScope,
      );
      signal?.throwIfAborted();
      if (scopes.length === 0) return { items: [] };

      let records = this.searchCache.get(normalizedQuery);
      let warning: string | undefined;
      if (!records) {
        const search = await searchFlatpakScopes(
          this.executable,
          normalizedQuery,
          scopes,
          signal,
        );
        ({ records, warning } = search);
        if (search.complete) this.searchCache.set(normalizedQuery, records);
      }
      const items = flatpakSearchItems(records, await installed, this.preferredScope);
      signal?.throwIfAborted();
      return { items, warning };
    } catch (error) {
      if (isFlatpakUnavailable(error)) return { items: [] };
      throw error;
    }
  }

  /** Resolves exact IDs; throws "unavailable" so callers can mark them unsupported. */
  async resolvePackageIds(
    requests: readonly FlatpakPackageRequest[],
    signal?: AbortSignal,
  ): Promise<Map<string, SoftwareItem>> {
    await this.requireExecutable();
    for (const request of requests) {
      assertAppId(request.id);
      if (request.remote && !isValidFlatpakRemoteName(request.remote)) {
        throw new FlatpakOperationError("not-found", "Invalid Flatpak remote");
      }
    }

    const installed = this.installedRecords();
    const scopes = selectFlatpakSearchScopes(await this.remotes(), this.preferredScope);
    if (scopes.length === 0) {
      throw new FlatpakOperationError("unavailable", "No Flatpak remotes are configured");
    }

    const resolved = new Map<string, SoftwareItem>();
    let successfulSearches = 0;
    let firstFailure: unknown;
    for (let index = 0; index < requests.length; index += RESOLVE_BATCH_SIZE) {
      const batch = requests.slice(index, index + RESOLVE_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((request) =>
        searchFlatpakScopes(this.executable, request.id, scopes, signal)
      ));
      const installedNow = await installed;
      results.forEach((result, resultIndex) => {
        const request = batch[resultIndex]!;
        if (result.status === "rejected") {
          firstFailure ??= result.reason;
          return;
        }
        successfulSearches += 1;
        const pkg = flatpakSearchItems(
          result.value.records.filter((record) =>
            record.id === request.id &&
            (!request.remote || record.remotes.includes(request.remote))
          ),
          installedNow,
          this.preferredScope,
          1,
        )[0];
        if (pkg?.flatpak) {
          if (request.remote) pkg.flatpak.remote = request.remote;
          resolved.set(request.id, pkg);
        }
      });
    }
    signal?.throwIfAborted();
    if (requests.length > 0 && successfulSearches === 0 && firstFailure) {
      throw firstFailure;
    }
    return resolved;
  }

  async install(
    pkg: SoftwareItem,
    options?: SoftwareOperationOptions,
  ): Promise<"installed" | "already-installed"> {
    const outcome = await this.installMany([pkg], options);
    if (outcome.missingIds.length > 0) {
      throw new FlatpakOperationError(
        "failed",
        "Flatpak finished, but the application is not installed",
        pkg.id,
      );
    }
    return outcome.installedIds.length > 0 ? "installed" : "already-installed";
  }

  /** Installs per scope and remote. Apps Flatpak did not install are reported as missing. */
  async installMany(
    packages: readonly SoftwareItem[],
    options?: SoftwareOperationOptions,
  ): Promise<SoftwareInstallBatchOutcome> {
    await this.requireExecutable();
    const requested = flatpakInstallTargets(packages);
    if (requested.length === 0) {
      return { installedIds: [], alreadyInstalledIds: [], missingIds: [] };
    }

    options?.onStatus?.({ message: "Checking Flatpak installation", cancellable: false });
    const [installedBefore, remotes] = await Promise.all([
      this.installedRecords(true),
      this.remotes(true),
    ]);
    options?.signal?.throwIfAborted();
    const installedKeys = installKeys(installedBefore);
    const targets = preferInstalledTargets(requested, installedKeys);
    const pending = targets.filter((target) => !installedKeys.has(target.key));
    const missingRemote = pending.find((target) =>
      !remotes.some((remote) =>
        remote.scope === target.scope && remote.name === target.remote
      )
    );
    if (missingRemote) {
      throw new FlatpakOperationError(
        "not-found",
        `Flatpak remote ${missingRemote.remote} is no longer configured`,
      );
    }

    // Scope/remote groups are independent transactions: a failure in one
    // must not hide what earlier groups already installed.
    let failure: unknown;
    try {
      for (const group of groupInstallTargets(pending)) {
        const { scope, remote } = group[0]!;
        try {
          await runFlatpakTransaction(
            this.executable,
            [
              "install",
              scopeFlag(scope),
              "--noninteractive",
              "--assumeyes",
              "--app",
              remote,
              ...group.map((target) => target.pkg.id),
            ],
            "Flatpak installation failed",
            options,
            `Installing ${group.length} Flatpak application${group.length === 1 ? "" : "s"}`,
          );
        } catch (error) {
          if (isOperationCancelled(error)) throw error;
          failure ??= error;
        }
      }
    } finally {
      // Partial transactions still change state; reload before reporting.
      if (pending.length > 0) void this.installedRecords(true);
    }

    const installedAfter = installKeys(await this.installedRecords());
    const installedIds = pending
      .filter((target) => installedAfter.has(target.key))
      .map((target) => target.pkg.id);
    if (failure !== undefined && installedIds.length === 0) throw failure;
    return {
      installedIds,
      alreadyInstalledIds: targets
        .filter((target) => installedKeys.has(target.key))
        .map((target) => target.pkg.id),
      missingIds: pending
        .filter((target) => !installedAfter.has(target.key))
        .map((target) => target.pkg.id),
      ...(failure === undefined ? {} : { failure }),
    };
  }

  async listInstalled(signal?: AbortSignal): Promise<SoftwareItem[]> {
    try {
      await this.requireExecutable();
    } catch (error) {
      if (isFlatpakUnavailable(error)) return [];
      throw error;
    }
    return listInstalledFlatpakApplications(this.executable, signal);
  }

  async remove(
    pkg: SoftwareItem,
    options?: SoftwareOperationOptions,
  ): Promise<"removed" | "not-installed"> {
    const scope = installedTargetScope(pkg, "Invalid Flatpak removal target");
    await this.requireExecutable();
    options?.onStatus?.({ message: "Checking Flatpak installation", cancellable: false });
    const key = flatpakInstallKey(scope, pkg.id);
    if (!installKeys(await this.installedRecords(true)).has(key)) {
      return "not-installed";
    }

    try {
      await runFlatpakTransaction(
        this.executable,
        ["uninstall", scopeFlag(scope), "--noninteractive", "--assumeyes", "--app", "--", pkg.id],
        "Flatpak removal failed",
        options,
        "Removing with Flatpak",
      );
    } finally {
      void this.installedRecords(true);
    }

    if (installKeys(await this.installedRecords()).has(key)) {
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
      listInstalledFlatpakApplications(this.executable, signal),
    ]);
    const installedByKey = new Map(installed.map((pkg) => [
      flatpakInstallKey(pkg.flatpak!.scope, pkg.id),
      pkg,
    ]));

    return records.flatMap((record) => {
      const installedPackage = installedByKey.get(
        flatpakInstallKey(record.scope, record.id),
      );
      if (!installedPackage) return [];
      return [{
        id: record.id,
        name: record.name,
        description: record.description,
        source: "flatpak",
        installed: true,
        currentVersion: installedPackage.version,
        availableVersion: record.availableVersion,
        repository: record.remote,
        downloadSize: record.downloadSize,
        flatpak: { remote: record.remote, scope: record.scope, branch: record.branch },
      } satisfies SoftwareUpdate];
    }).sort((left, right) => left.name.localeCompare(right.name));
  }

  async update(
    pkg: SoftwareUpdate,
    options?: SoftwareOperationOptions,
  ): Promise<void> {
    const scope = installedTargetScope(pkg, "Invalid Flatpak update target");
    await this.requireExecutable();
    options?.onStatus?.({ message: "Checking Flatpak installation", cancellable: false });
    const installed = installKeys(await this.installedRecords(true));
    if (!installed.has(flatpakInstallKey(scope, pkg.id))) {
      throw new FlatpakOperationError("not-found", "Flatpak application is not installed");
    }

    await runFlatpakTransaction(
      this.executable,
      ["update", scopeFlag(scope), "--noninteractive", "--assumeyes", "--app", "--", pkg.id],
      "Flatpak application update failed",
      options,
      "Updating with Flatpak",
    );
  }

  async updateAll(
    updates: readonly SoftwareUpdate[],
    options?: SoftwareOperationOptions,
  ): Promise<void> {
    options?.onStatus?.({ message: "Preparing Flatpak updates", cancellable: false });
    const scopes = updates.map((update) =>
      installedTargetScope(update, "Invalid Flatpak update target")
    );
    await this.requireExecutable();
    for (const scope of ALL_SCOPES) {
      const ids = updates.filter((_, index) => scopes[index] === scope).map((pkg) => pkg.id);
      if (ids.length === 0) continue;
      await runFlatpakTransaction(
        this.executable,
        ["update", scopeFlag(scope), "--noninteractive", "--assumeyes", "--app", "--", ...ids],
        "Flatpak application update failed",
        options,
        "Updating with Flatpak",
      );
    }
  }

  async refreshMetadata(options?: SoftwareOperationOptions): Promise<void> {
    await this.requireExecutable();
    options?.onStatus?.({ message: "Refreshing Flatpak metadata", cancellable: false });
    await this.listUpdateRecords(false);
  }

  async previewCleanup(signal?: AbortSignal): Promise<FlatpakCleanupItem[]> {
    await this.requireExecutable();
    return previewFlatpakCleanup(this.executable, signal);
  }

  async cleanUnused(
    items: readonly FlatpakCleanupItem[],
    options?: SoftwareOperationOptions,
  ): Promise<void> {
    await this.requireExecutable();
    if (items.length === 0) return;
    const scopes = new Set(items.map((item) => item.scope));
    for (const scope of ALL_SCOPES) {
      if (!scopes.has(scope)) continue;
      options?.onStatus?.({ message: "Rechecking Flatpak cleanup plan", cancellable: false });
      const current = await this.previewCleanup(options?.signal);
      const reviewed = items.filter((item) => item.scope === scope);
      const fresh = current.filter((item) => item.scope === scope);
      const identity = (item: FlatpakCleanupItem) => `${item.id}:${item.branch}:${item.ref}`;
      const approved = new Set(reviewed.map(identity));
      if (reviewed.some((item) => !item.ref) ||
        fresh.length !== approved.size || fresh.some((item) => !approved.has(identity(item)))) {
        throw new FlatpakOperationError(
          "failed", "Flatpak cleanup changed since review",
          "Refresh the cleanup preview and review the runtimes again before cleaning.",
        );
      }
      await runFlatpakTransaction(
        this.executable,
        ["uninstall", scopeFlag(scope), "--runtime", "--no-related", "--noninteractive", "--assumeyes", "--",
          ...reviewed.map((item) => item.ref!)],
        `Flatpak ${scope} cleanup failed`,
        options,
        `Removing unused Flatpak ${scope} runtimes`,
      );
    }
  }

  private async listUpdateRecords(cached: boolean, signal?: AbortSignal) {
    const scopes = sortFlatpakScopes(
      (await this.remotes()).map((remote) => remote.scope),
      this.preferredScope,
    );
    return listFlatpakUpdateRecords(this.executable, scopes, cached, signal);
  }

  private async requireExecutable(): Promise<void> {
    try {
      await requireExecutable(this.executable);
    } catch (error) {
      throw new FlatpakOperationError("unavailable", "Flatpak is not installed", String(error));
    }
  }
}

function installKeys(installed: readonly InstalledFlatpak[]): Set<string> {
  return new Set(installed.map((app) => flatpakInstallKey(app.scope, app.id)));
}

/**
 * Loads a value once and shares it. `fresh` reloads it; failures are not kept.
 * Loads take no AbortSignal so one cancelled search cannot poison the cache.
 */
function cachedLoader<T>(load: () => Promise<T>): (fresh?: boolean) => Promise<T> {
  let value: Promise<T> | undefined;
  return (fresh = false) => {
    if (fresh || !value) {
      const pending = load();
      value = pending;
      pending.catch(() => {
        if (value === pending) value = undefined;
      });
    }
    return value;
  };
}
