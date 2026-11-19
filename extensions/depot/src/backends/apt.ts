import { readdir, readFile } from "node:fs/promises";
import { basename } from "node:path";
import type {
  SoftwareInstallBatchOutcome,
  SoftwareOperationOptions,
  SoftwareItem,
  SoftwareUpdate,
} from "../types.ts";
import { LINUX_EXECUTABLES } from "../linux.ts";
import {
  C_LOCALE_ENV,
  ProcessExecutionError,
  ProcessOutputTruncatedError,
  requireCompleteOutput,
  runProcess,
  summarizeProcessOutput,
} from "../utils/process.ts";
import { AptOperationError } from "./apt-errors.ts";
import {
  APT_SIMULATION_OUTPUT_LIMIT,
  aptSimulationArgs,
  requireAptExecutable,
  runAptTransaction,
} from "./apt-transaction.ts";
import {
  escapeAptSearchPattern,
  isValidAptPackageId,
  parseAptPackageDetails,
  parseAptSearchOutput,
  parseDpkgStatusOutput,
  rankAptSearchResults,
} from "./apt-parsing.ts";
import {
  compareCleanupPlan,
  isPartialCachePermissionFailure,
  parseAptAutocleanSimulation,
  parseAptAutoremoveSimulation,
  type AptArchiveCleanupItem,
} from "./cleanup-parsing.ts";
import {
  inspectAptRemovalPlan,
  isConservativeRemovalCandidate,
  parseAptRemovalSimulation,
  parseAptMarkOutput,
  parseDpkgInstalledMetadata,
  parseDpkgOwnershipOutput,
  resolveInstalledAptPackageId,
  selectManualProfilePackageIds,
  toAptPackageId,
  type AptInstalledMetadata,
} from "./apt-installed-parsing.ts";
import { parseDesktopEntry, type DesktopEntry } from "./desktop-entry.ts";
import {
  parseAptUpgradableOutput,
  parseAptUpgradeSimulation,
  selectInstallableUpdates,
} from "./apt-update-parsing.ts";

export { AptOperationError, type AptErrorKind } from "./apt-errors.ts";

const {
  apt: APT,
  aptCache: APT_CACHE,
  aptGet: APT_GET,
  aptMark: APT_MARK,
  dpkg: DPKG,
  dpkgQuery: DPKG_QUERY,
} = LINUX_EXECUTABLES;
const SEARCH_LIMIT = 40;
const SEARCH_CANDIDATE_LIMIT = 800;
const SEARCH_TIMEOUT_MS = 10_000;
const DPKG_FORMAT = "${binary:Package}\\t${db:Status-Abbrev}\\n";
const DPKG_METADATA_FORMAT =
  "${binary:Package}\\t${db:Status-Abbrev}\\t${Essential}\\t${Priority}\\t${Section}\\n";
const DESKTOP_APPLICATIONS_DIRECTORY = "/usr/share/applications";
const OWNERSHIP_BATCH_SIZE = 64;

export interface AptRemovalPreview {
  targetId: string;
  additionalIds: string[];
}

export interface AptCleanupPreview {
  packageIds: string[];
  archives: AptArchiveCleanupItem[];
  reclaimableSpace?: string;
  cacheInspectionLimited: boolean;
}

export class AptBackend {
  readonly source = "apt" as const;
  private nativeArchitecture?: Promise<string>;

  async search(query: string, signal?: AbortSignal): Promise<SoftwareItem[]> {
    await requireAptExecutable(
      APT_CACHE,
      "APT search is not available",
    );

    const normalizedQuery = query.trim().slice(0, 100);
    if (normalizedQuery.length < 2) return [];

    const patterns = normalizedQuery
      .split(/\s+/)
      .slice(0, 6)
      .map(escapeAptSearchPattern);
    const searchOptions = {
      signal,
      env: C_LOCALE_ENV,
      maxLines: SEARCH_CANDIDATE_LIMIT,
      maxOutputBytes: 1024 * 1024,
      timeoutMs: SEARCH_TIMEOUT_MS,
    };

    const [nameMatches, allMatches] = await Promise.all([
      runProcess(
        APT_CACHE,
        ["search", "--names-only", "--", ...patterns],
        searchOptions,
      ),
      runProcess(
        APT_CACHE,
        ["search", "--", ...patterns],
        searchOptions,
      ),
    ]);

    signal?.throwIfAborted();

    const ranked = rankAptSearchResults(
      [
        ...parseAptSearchOutput(nameMatches.stdout),
        ...parseAptSearchOutput(allMatches.stdout),
      ],
      normalizedQuery,
      SEARCH_LIMIT,
    );
    const installed = await this.getInstalledPackageIds(
      ranked.map((record) => record.id),
      signal,
    );

    signal?.throwIfAborted();

    return ranked.map((record) => ({
      id: record.id,
      name: record.id,
      description: record.description,
      source: this.source,
      installed: installed.has(record.id),
    }));
  }

  async getDetails(id: string, signal?: AbortSignal): Promise<SoftwareItem> {
    assertPackageId(id);
    const result = await runProcess(
      APT_CACHE,
      ["show", "--no-all-versions", "--", id],
      { signal, env: C_LOCALE_ENV, maxOutputBytes: 512 * 1024 },
    );
    const details = parseAptPackageDetails(result.stdout);

    if (!details) {
      throw new AptOperationError("not-found", "APT package not found", result.stderr);
    }

    return {
      id: details.id,
      name: details.id,
      description: details.description,
      source: this.source,
      installed: await this.isInstalled(id, signal),
      version: details.version,
      homepage: details.homepage,
      longDescription: details.longDescription,
    };
  }

  async isInstalled(id: string, signal?: AbortSignal): Promise<boolean> {
    assertPackageId(id);
    await requireAptExecutable(
      DPKG_QUERY,
      "Installed package state is not available",
    );

    const result = await runProcess(
      DPKG_QUERY,
      ["--show", `--showformat=${DPKG_FORMAT}`, "--", id],
      {
        signal,
        allowNonZero: true,
        env: C_LOCALE_ENV,
        maxOutputBytes: 64 * 1024,
      },
    );

    return parseDpkgStatusOutput(result.stdout).size > 0;
  }

  async install(
    pkg: SoftwareItem,
    options?: SoftwareOperationOptions,
  ): Promise<"installed" | "already-installed"> {
    const outcome = await this.installMany([pkg], options);
    if (outcome.missingIds.length > 0) {
      throw new AptOperationError(
        "not-found",
        `${pkg.id} is not available from configured repositories or was not installed`,
      );
    }
    return outcome.installedIds.includes(pkg.id)
      ? "installed"
      : "already-installed";
  }

  async installMany(
    packages: readonly SoftwareItem[],
    options?: SoftwareOperationOptions,
  ): Promise<SoftwareInstallBatchOutcome> {
    const unique = new Map<string, SoftwareItem>();
    for (const pkg of packages) {
      if (pkg.source !== this.source) {
        throw new AptOperationError("not-found", "Invalid APT install target");
      }
      assertPackageId(pkg.id);
      unique.set(pkg.id, pkg);
    }
    const ids = [...unique.keys()];
    if (ids.length === 0) {
      return { installedIds: [], alreadyInstalledIds: [], missingIds: [] };
    }

    const installedBefore = await this.getInstalledPackageIds(ids, options?.signal);
    const alreadyInstalledIds = ids.filter((id) =>
      Boolean(resolveInstalledAptPackageId(id, installedBefore))
    );
    const pendingIds = ids.filter((id) => !alreadyInstalledIds.includes(id));
    if (pendingIds.length === 0) {
      return { installedIds: [], alreadyInstalledIds, missingIds: [] };
    }

    // Unavailable packages are reported as missing; the rest still install.
    const unavailableIds: string[] = [];
    for (const batch of chunks(pendingIds, 8)) {
      const candidates = await Promise.all(
        batch.map((id) => this.hasCandidate(id, options?.signal)),
      );
      unavailableIds.push(...batch.filter((_, index) => !candidates[index]));
    }
    const installableIds = pendingIds.filter((id) => !unavailableIds.includes(id));
    if (installableIds.length === 0) {
      return { installedIds: [], alreadyInstalledIds, missingIds: unavailableIds };
    }

    const installArgs = ["--yes", "--no-remove", "install", "--", ...installableIds];
    await runAptTransaction({
      aptDaemonRequest: { kind: "install-packages", packageIds: installableIds },
      directExecutable: APT_GET,
      directArgs: installArgs,
      simulationArgs: aptSimulationArgs(installArgs),
      unavailableMessage: "APT installation is not available",
      cancelledMessage: "Installation was cancelled",
      failureMessage: "Package installation failed",
    }, options);

    const installedAfter = await this.getInstalledPackageIds(
      installableIds,
      options?.signal,
    );
    const notInstalledIds = installableIds.filter((id) =>
      !resolveInstalledAptPackageId(id, installedAfter)
    );
    return {
      installedIds: installableIds.filter((id) => !notInstalledIds.includes(id)),
      alreadyInstalledIds,
      missingIds: [...unavailableIds, ...notInstalledIds],
    };
  }

  async listInstalled(signal?: AbortSignal): Promise<SoftwareItem[]> {
    await requireAptExecutable(
      APT_MARK,
      "APT manual package state is not available",
    );

    const [nativeArchitecture, desktopFiles, manualResult] = await Promise.all([
      this.getNativeArchitecture(),
      loadDesktopEntries(signal),
      runProcess(APT_MARK, ["showmanual"], {
        signal,
        env: C_LOCALE_ENV,
        maxOutputBytes: 512 * 1024,
      }),
    ]);
    const manuallyInstalled = parseAptMarkOutput(manualResult.stdout);
    const ownership = new Map<string, string[]>();
    for (const paths of chunks([...desktopFiles.keys()], OWNERSHIP_BATCH_SIZE)) {
      const result = await runProcess(
        DPKG_QUERY,
        ["--search", "--", ...paths],
        {
          signal,
          allowNonZero: true,
          env: C_LOCALE_ENV,
          maxOutputBytes: 512 * 1024,
        },
      );
      for (const [path, owners] of parseDpkgOwnershipOutput(result.stdout)) {
        ownership.set(
          path,
          owners.map((id) => toAptPackageId(id, nativeArchitecture)),
        );
      }
    }

    const packageEntries = new Map<
      string,
      { entry: DesktopEntry; filePath: string }
    >();
    for (const [path, owners] of ownership) {
      const entry = desktopFiles.get(path);
      if (!entry) continue;
      for (const id of owners) {
        if (manuallyInstalled.has(id) && !packageEntries.has(id)) {
          packageEntries.set(id, { entry, filePath: path });
        }
      }
    }

    const metadata = await this.getInstalledMetadata(
      [...packageEntries.keys()],
      signal,
    );
    signal?.throwIfAborted();

    return [...packageEntries]
      .filter(([id]) => isConservativeRemovalCandidate(metadata.get(id)))
      .map(([id, { entry, filePath }]) => ({
        id,
        name: entry.name,
        description: entry.description,
        source: this.source,
        installed: true,
        desktopEntry: {
          id: basename(filePath),
          filePath,
        },
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listManualPackageIds(signal?: AbortSignal): Promise<string[]> {
    await requireAptExecutable(
      APT_MARK,
      "APT manual package state is not available",
    );
    const result = await runProcess(APT_MARK, ["showmanual"], {
      signal,
      env: C_LOCALE_ENV,
      maxOutputBytes: 512 * 1024,
    });
    const manualIds = parseAptMarkOutput(result.stdout);
    const metadata = await this.getInstalledMetadata([...manualIds], signal);
    signal?.throwIfAborted();
    return selectManualProfilePackageIds(manualIds, metadata);
  }

  async remove(
    pkg: SoftwareItem,
    options?: SoftwareOperationOptions,
  ): Promise<"removed" | "not-installed"> {
    const targetId = await this.resolveRemovalTarget(pkg, options?.signal);
    if (!targetId) return "not-installed";

    const args = removalArgs(targetId);
    await runAptTransaction({
      aptDaemonRequest: { kind: "remove-packages", packageIds: [targetId] },
      directExecutable: APT_GET,
      directArgs: args,
      simulationArgs: aptSimulationArgs(args),
      validateSimulation: (output) =>
        assertSafeRemovalSimulation(targetId, output),
      unavailableMessage: "APT removal is not available",
      cancelledMessage: "Removal was cancelled",
      failureMessage: "Package removal failed",
    }, options);

    if (await this.isInstalled(targetId)) {
      throw new AptOperationError(
        "failed",
        "APT finished, but the package is still installed",
      );
    }

    return "removed";
  }

  async previewRemoval(
    pkg: SoftwareItem,
    signal?: AbortSignal,
  ): Promise<AptRemovalPreview | undefined> {
    const targetId = await this.resolveRemovalTarget(pkg, signal);
    if (!targetId) return undefined;

    let output: string;
    try {
      const simulation = await runProcess(
        APT_GET,
        aptSimulationArgs(removalArgs(targetId)),
        {
          signal,
          env: C_LOCALE_ENV,
          maxOutputBytes: APT_SIMULATION_OUTPUT_LIMIT,
        },
      );
      output = requireCompleteOutput(APT_GET, simulation).stdout;
    } catch (error) {
      throw planError(error, "APT could not prepare this removal");
    }

    return verifiedRemovalPlan(targetId, output);
  }

  async previewCleanup(signal?: AbortSignal): Promise<AptCleanupPreview> {
    await requireAptExecutable(APT_GET, "APT cleanup is not available");

    try {
      const [autoremove, autoclean] = await Promise.all([
        runProcess(
          APT_GET,
          ["--simulate", "autoremove", "--purge"],
          {
            signal,
            env: C_LOCALE_ENV,
            maxOutputBytes: APT_SIMULATION_OUTPUT_LIMIT,
          },
        ),
        runProcess(
          APT_GET,
          ["--simulate", "autoclean"],
          {
            signal,
            allowNonZero: true,
            env: C_LOCALE_ENV,
            maxOutputBytes: APT_SIMULATION_OUTPUT_LIMIT,
          },
        ),
      ]);
      requireCompleteOutput(APT_GET, autoremove);
      requireCompleteOutput(APT_GET, autoclean);
      const archiveOutput = [autoclean.stdout, autoclean.stderr]
        .filter(Boolean).join("\n");
      const cacheInspectionLimited = autoclean.exitCode !== 0 &&
        isPartialCachePermissionFailure(archiveOutput);
      if (autoclean.exitCode !== 0 && !cacheInspectionLimited) {
        throw new AptOperationError(
          "failed",
          "APT could not inspect its package cache",
          summarizeProcessOutput(archiveOutput),
        );
      }

      const autoremovePlan = parseAptAutoremoveSimulation(autoremove.stdout);
      const metadata = await this.getInstalledMetadata(
        autoremovePlan.packageIds,
        signal,
      );
      const protectedPackages = autoremovePlan.packageIds.filter((id) =>
        !isConservativeRemovalCandidate(metadata.get(id))
      );
      if (protectedPackages.length > 0) {
        throw new AptOperationError(
          "unsafe",
          "APT cleanup includes protected system packages",
          protectedPackages.join("\n"),
        );
      }

      return {
        packageIds: autoremovePlan.packageIds,
        archives: parseAptAutocleanSimulation(autoclean.stdout),
        reclaimableSpace: autoremovePlan.reclaimableSpace,
        cacheInspectionLimited,
      };
    } catch (error) {
      throw planError(error, "APT could not prepare a cleanup plan");
    }
  }

  async clean(
    preview: AptCleanupPreview,
    options?: SoftwareOperationOptions,
  ): Promise<void> {
    const approvedIds = [...new Set(preview.packageIds)].sort();
    approvedIds.forEach(assertPackageId);

    if (approvedIds.length > 0) {
      // Purge exactly the reviewed packages, never whatever APT considers
      // autoremovable at run time.
      const purgeArgs = [
        "--yes",
        "--no-auto-remove",
        "purge",
        "--",
        ...approvedIds,
      ];
      await runAptTransaction({
        directExecutable: APT_GET,
        directArgs: purgeArgs,
        simulationArgs: aptSimulationArgs(purgeArgs),
        validateSimulation: (output) => assertReviewedCleanup(approvedIds, output),
        unavailableMessage: "APT cleanup is not available",
        cancelledMessage: "Cleanup was cancelled",
        failureMessage: "APT package cleanup failed",
      }, options);
    }

    // Purging adds no obsolete archives, so autoclean runs only for archives
    // the preview found; an unreadable partial-download cache is not a target.
    if (preview.archives.length > 0) {
      options?.onStatus?.({
        message: "Cleaning obsolete APT archives",
        cancellable: false,
      });
      await runAptTransaction({
        directExecutable: APT_GET,
        directArgs: ["--yes", "autoclean"],
        unavailableMessage: "APT cleanup is not available",
        cancelledMessage: "Cleanup was cancelled",
        failureMessage: "APT package-cache cleanup failed",
      }, options);
    }
  }

  async listUpdates(signal?: AbortSignal): Promise<SoftwareUpdate[]> {
    await requireAptExecutable(
      APT,
      "APT update information is not available",
    );

    const listOptions = {
      signal,
      env: C_LOCALE_ENV,
      maxOutputBytes: APT_SIMULATION_OUTPUT_LIMIT,
      timeoutMs: 20_000,
    };
    // `apt list` also reports held packages and updates Ubuntu is still
    // phasing in. Offer only what a normal upgrade would install now, and
    // never a held package even if the resolver would touch it.
    const [listing, simulation, holds] = await Promise.all([
      runProcess(APT, ["list", "--upgradable"], listOptions),
      runProcess(
        APT_GET,
        ["--simulate", "--with-new-pkgs", "upgrade"],
        listOptions,
      ),
      runProcess(APT_MARK, ["showhold"], listOptions),
    ]);
    const upgradeable = parseAptUpgradeSimulation(
      requireCompleteOutput(APT_GET, simulation).stdout,
    );
    const held = parseAptMarkOutput(requireCompleteOutput(APT_MARK, holds).stdout);

    return selectInstallableUpdates(
      parseAptUpgradableOutput(listing.stdout),
      upgradeable,
      held,
    )
      .map((record) => ({
        id: record.id,
        name: record.name,
        description: `${record.repository} · ${record.architecture}`,
        source: this.source,
        installed: true,
        currentVersion: record.currentVersion,
        availableVersion: record.availableVersion,
        repository: record.repository,
        architecture: record.architecture,
      }))
      .sort((left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      );
  }

  async update(
    pkg: SoftwareUpdate,
    options?: SoftwareOperationOptions,
  ): Promise<void> {
    assertPackageId(pkg.id);
    if (!(await this.isInstalled(pkg.id))) {
      throw new AptOperationError("not-found", "APT package is not installed");
    }
    await this.updateAll([pkg], options);
  }

  async updateAll(
    updates: readonly SoftwareUpdate[],
    options?: SoftwareOperationOptions,
  ): Promise<void> {
    if (updates.length === 0) return;
    for (const update of updates) {
      if (update.source !== this.source) {
        throw new AptOperationError("not-found", "Invalid APT update target");
      }
      assertPackageId(update.id);
    }
    const upgradeArgs = [
      "--yes",
      "--no-remove",
      "--only-upgrade",
      "install",
      "--",
      ...updates.map((update) => update.id),
    ];
    // The simulation keeps --yes so it refuses exactly what the real run
    // would, including changes to held packages.
    await runAptTransaction({
      directExecutable: APT_GET,
      directArgs: upgradeArgs,
      simulationArgs: aptSimulationArgs(upgradeArgs),
      unavailableMessage: "APT package management is not available",
      cancelledMessage: "Update was cancelled",
      failureMessage: updates.length === 1
        ? "Package update failed"
        : "APT update failed",
    }, options);
  }

  async refreshMetadata(options?: SoftwareOperationOptions): Promise<void> {
    await runAptTransaction({
      aptDaemonRequest: { kind: "refresh-cache" },
      directExecutable: APT_GET,
      directArgs: ["update"],
      unavailableMessage: "APT package management is not available",
      cancelledMessage: "Metadata refresh was cancelled",
      failureMessage: "APT package metadata refresh failed",
    }, options);
  }

  private async getInstalledPackageIds(
    ids: readonly string[],
    signal?: AbortSignal,
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const nativeArchitecture = await this.getNativeArchitecture();
    const result = await runProcess(
      DPKG_QUERY,
      ["--show", `--showformat=${DPKG_FORMAT}`, "--", ...ids],
      {
        signal,
        allowNonZero: true,
        env: C_LOCALE_ENV,
        maxOutputBytes: 128 * 1024,
      },
    );

    return new Set(
      [...parseDpkgStatusOutput(result.stdout)]
        .map((id) => toAptPackageId(id, nativeArchitecture)),
    );
  }

  /**
   * dpkg reports native "Multi-Arch: same" packages as `name:arch`, while
   * apt-get, apt-mark, and apt list omit the native qualifier. Every
   * dpkg-derived identifier is converted to APT's form before comparison.
   */
  getNativeArchitecture(): Promise<string> {
    if (this.nativeArchitecture) return this.nativeArchitecture;
    const pending = (async () => {
      await requireAptExecutable(
        DPKG,
        "Installed package state is not available",
      );
      const result = await runProcess(DPKG, ["--print-architecture"], {
        env: C_LOCALE_ENV,
        maxOutputBytes: 1024,
      });
      const architecture = result.stdout.trim();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(architecture)) {
        throw new AptOperationError(
          "failed",
          "The native package architecture could not be determined",
          architecture,
        );
      }
      return architecture;
    })();
    this.nativeArchitecture = pending;
    pending.catch(() => {
      if (this.nativeArchitecture === pending) this.nativeArchitecture = undefined;
    });
    return pending;
  }

  private async hasCandidate(
    id: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const result = await runProcess(APT_CACHE, ["policy", "--", id], {
      signal,
      allowNonZero: true,
      env: C_LOCALE_ENV,
      maxOutputBytes: 128 * 1024,
    });
    const candidate = result.stdout.match(/^\s*Candidate:\s*(\S+)/m)?.[1];
    return Boolean(candidate && candidate !== "(none)");
  }

  private async getInstalledMetadata(
    ids: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<string, AptInstalledMetadata>> {
    if (ids.length === 0) return new Map();
    const nativeArchitecture = await this.getNativeArchitecture();
    const result = await runProcess(
      DPKG_QUERY,
      ["--show", `--showformat=${DPKG_METADATA_FORMAT}`, "--", ...ids],
      {
        signal,
        allowNonZero: true,
        env: C_LOCALE_ENV,
        maxOutputBytes: 512 * 1024,
      },
    );
    const metadata = new Map<string, AptInstalledMetadata>();
    for (const record of parseDpkgInstalledMetadata(result.stdout).values()) {
      const id = toAptPackageId(record.id, nativeArchitecture);
      metadata.set(id, { ...record, id });
    }
    return metadata;
  }

  private async resolveRemovalTarget(
    pkg: SoftwareItem,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    assertPackageId(pkg.id);
    await requireAptExecutable(APT_GET, "APT removal is not available");
    if (pkg.source !== this.source) return undefined;

    const installedIds = await this.getInstalledPackageIds([pkg.id], signal);
    if (installedIds.size === 0) return undefined;
    const targetId = resolveInstalledAptPackageId(pkg.id, installedIds);
    if (!targetId) {
      throw new AptOperationError(
        "unsafe",
        "Removal was blocked because the installed package architecture is ambiguous",
        [...installedIds].join("\n"),
      );
    }

    const metadata = await this.getInstalledMetadata([targetId], signal);
    if (!isConservativeRemovalCandidate(metadata.get(targetId))) {
      throw new AptOperationError(
        "unsafe",
        "This package is protected from removal",
      );
    }
    return targetId;
  }
}

function removalArgs(targetId: string): string[] {
  return ["--yes", "--no-auto-remove", "remove", "--", targetId];
}

function assertReviewedCleanup(approvedIds: readonly string[], output: string): void {
  const { unexpected, missing } = compareCleanupPlan(approvedIds, output);
  if (unexpected.length === 0 && missing.length === 0) return;
  throw new AptOperationError(
    "unsafe",
    "Cleanup changed since review",
    [
      ...unexpected.map((id) => `Would also remove: ${id}`),
      ...missing.map((id) => `No longer removed: ${id}`),
    ].join("\n"),
  );
}

function planError(error: unknown, message: string): unknown {
  if (error instanceof ProcessOutputTruncatedError) {
    return new AptOperationError("unsafe", message, error.message);
  }
  if (!(error instanceof ProcessExecutionError)) return error;
  return new AptOperationError(
    "failed",
    message,
    summarizeProcessOutput([error.result.stdout, error.result.stderr]
      .filter(Boolean).join("\n")),
  );
}

function assertSafeRemovalSimulation(targetId: string, output: string): void {
  const removalPlan = verifiedRemovalPlan(targetId, output);
  if (removalPlan.additionalIds.length > 0) {
    throw new AptOperationError(
      "unsafe",
      "Removal was blocked because other software would also be removed",
      removalPlan.additionalIds.join("\n"),
    );
  }
}

function verifiedRemovalPlan(
  targetId: string,
  output: string,
): AptRemovalPreview {
  const planned = [...new Set(parseAptRemovalSimulation(output))];
  const removalPlan = inspectAptRemovalPlan(targetId, planned);
  if (!removalPlan.includesTarget) {
    throw new AptOperationError(
      "failed",
      "APT could not prepare this removal",
      summarizeProcessOutput(output),
    );
  }
  return { targetId, additionalIds: removalPlan.additionalIds };
}

async function loadDesktopEntries(
  signal?: AbortSignal,
): Promise<Map<string, DesktopEntry>> {
  const entries = new Map<string, DesktopEntry>();
  const files = (await readdir(DESKTOP_APPLICATIONS_DIRECTORY))
    .filter((name) => name.endsWith(".desktop"))
    .sort();

  await Promise.all(files.map(async (name) => {
    signal?.throwIfAborted();
    const path = `${DESKTOP_APPLICATIONS_DIRECTORY}/${name}`;
    try {
      const entry = parseDesktopEntry(await readFile(path, "utf8"));
      if (entry && !entry.hidden && !entry.noDisplay) entries.set(path, entry);
    } catch (error) {
      console.error(`Unable to read desktop entry ${path}`, error);
    }
  }));
  signal?.throwIfAborted();
  return entries;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function assertPackageId(id: string): void {
  if (!isValidAptPackageId(id)) {
    throw new AptOperationError("not-found", "Invalid APT package ID");
  }
}

export const aptBackend = new AptBackend();
