import { LINUX_EXECUTABLES } from "../linux.ts";
import type { SoftwareItem, SoftwareOperationOptions, SoftwareUpdate } from "../types.ts";
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
  isConservativeRemovalCandidate,
  parseAptMarkOutput,
  parseDpkgInstalledMetadata,
  toAptPackageId,
  type AptInstalledMetadata,
} from "./apt-installed-parsing.ts";
import {
  isValidAptPackageId,
  parseAptPackageDetails,
  parseDpkgStatusOutput,
} from "./apt-parsing.ts";
import {
  APT_SIMULATION_OUTPUT_LIMIT,
  aptSimulationArgs,
  requireAptExecutable,
  runAptTransaction,
} from "./apt-transaction.ts";
import {
  parseAptUpgradableOutput,
  parseAptUpgradeSimulation,
  selectInstallableUpdates,
} from "./apt-update-parsing.ts";
import {
  compareCleanupPlan,
  isPartialCachePermissionFailure,
  parseAptAutocleanSimulation,
  parseAptAutoremoveSimulation,
  type AptArchiveCleanupItem,
} from "./cleanup-parsing.ts";

const {
  apt: APT,
  aptCache: APT_CACHE,
  aptGet: APT_GET,
  aptMark: APT_MARK,
  dpkg: DPKG,
  dpkgQuery: DPKG_QUERY,
} = LINUX_EXECUTABLES;
const DPKG_FORMAT = "${binary:Package}\\t${db:Status-Abbrev}\\n";
const DPKG_METADATA_FORMAT =
  "${binary:Package}\\t${db:Status-Abbrev}\\t${Essential}\\t${Priority}\\t${Section}\\n";

export interface AptCleanupPreview {
  packageIds: string[];
  archives: AptArchiveCleanupItem[];
  reclaimableSpace?: string;
  cacheInspectionLimited: boolean;
}

export class AptBackend {
  readonly source = "apt" as const;
  private nativeArchitecture?: Promise<string>;

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

function assertPackageId(id: string): void {
  if (!isValidAptPackageId(id)) {
    throw new AptOperationError("not-found", "Invalid APT package ID");
  }
}

export const aptBackend = new AptBackend();
