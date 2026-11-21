import { LINUX_EXECUTABLES } from "../linux.ts";
import type { FlatpakScope, SoftwareOperationOptions, SoftwareUpdate } from "../types.ts";
import { requireExecutable } from "../utils/process.ts";
import type { FlatpakCleanupItem } from "./cleanup-parsing.ts";
import { ALL_SCOPES, FlatpakOperationError, scopeFlag } from "./flatpak-common.ts";
import {
  listFlatpakRemotes,
  listFlatpakUpdateRecords,
  listInstalledFlatpakApplications,
  listInstalledFlatpaks,
  previewFlatpakCleanup,
} from "./flatpak-listing.ts";
import { flatpakInstallKey, sortFlatpakScopes } from "./flatpak-parsing.ts";
import { installedTargetScope, runFlatpakTransaction } from "./flatpak-transactions.ts";

/**
 * Flatpak CLI adapter. One instance belongs to one open command: remotes and
 * update metadata is loaded lazily for the active command.
 */
export class FlatpakBackend {
  private readonly executable: string;
  private readonly preferredScope: FlatpakScope;
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
    const installed = new Set((await this.installedRecords(true)).map((app) =>
      flatpakInstallKey(app.scope, app.id)
    ));
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

/**
 * Loads a value once and shares it. `fresh` reloads it; failures are not kept.
 * Loads take no AbortSignal so a cancelled query cannot poison the cache.
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

export { FlatpakOperationError } from "./flatpak-common.ts";
