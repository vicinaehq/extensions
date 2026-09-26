import { readdir, readFile } from "node:fs/promises";
import type {
  PackageBackend,
  SoftwareOperationOptions,
  SoftwareItem,
  SoftwareUpdate,
} from "../types";
import { DepotOperationError } from "../errors.ts";
import { LINUX_EXECUTABLES } from "../linux.ts";
import {
  C_LOCALE_ENV,
  requireExecutable,
  runProcess,
  summarizeProcessOutput,
} from "../utils/process";
import {
  runAptTransaction,
} from "./apt-transaction.ts";
import {
  escapeAptSearchPattern,
  isValidAptPackageId,
  parseAptPackageDetails,
  parseAptSearchOutput,
  parseDpkgStatusOutput,
  rankAptSearchResults,
} from "./apt-parsing";
import {
  inspectAptRemovalPlan,
  isConservativeRemovalCandidate,
  parseAptRemovalSimulation,
  parseAptMarkOutput,
  parseDpkgInstalledMetadata,
  parseDpkgOwnershipOutput,
  resolveInstalledAptPackageId,
} from "./apt-installed-parsing";
import { parseDesktopEntry, type DesktopEntry } from "./desktop-entry";
import { parseAptUpgradableOutput } from "./apt-update-parsing";

const {
  apt: APT,
  aptCache: APT_CACHE,
  aptGet: APT_GET,
  aptMark: APT_MARK,
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

export type AptErrorKind =
  | "unavailable"
  | "not-found"
  | "cancelled"
  | "authentication"
  | "unsafe"
  | "failed";

export class AptOperationError extends DepotOperationError<AptErrorKind> {
  constructor(
    kind: AptErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super("AptOperationError", kind, message, technicalDetails);
  }
}

export class AptBackend implements PackageBackend {
  readonly source = "apt" as const;

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
    const id = pkg.id;
    assertPackageId(id);

    if (await this.isInstalled(id)) return "already-installed";
    if (!(await this.hasCandidate(id))) {
      throw new AptOperationError(
        "not-found",
        "The package is no longer available from configured repositories",
      );
    }

    await runAptTransaction({
      aptDaemonRequest: { kind: "install-packages", packageIds: [id] },
      directExecutable: APT_GET,
      directArgs: ["--yes", "--no-remove", "install", "--", id],
      simulationArgs: ["--simulate", "--no-remove", "install", "--", id],
      unavailableMessage: "APT installation is not available",
      cancelledMessage: "Installation was cancelled",
      failureMessage: "Package installation failed",
    }, options);

    if (!(await this.isInstalled(id))) {
      throw new AptOperationError(
        "failed",
        "APT finished, but the package is not installed",
      );
    }

    return "installed";
  }

  async listInstalled(signal?: AbortSignal): Promise<SoftwareItem[]> {
    await requireAptExecutable(
      DPKG_QUERY,
      "Installed package state is not available",
    );
    await requireAptExecutable(
      APT_MARK,
      "APT manual package state is not available",
    );

    const [desktopFiles, manualResult] = await Promise.all([
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
        ownership.set(path, owners);
      }
    }

    const packageEntries = new Map<string, DesktopEntry>();
    for (const [path, owners] of ownership) {
      const entry = desktopFiles.get(path);
      if (!entry) continue;
      for (const id of owners) {
        if (manuallyInstalled.has(id) && !packageEntries.has(id)) {
          packageEntries.set(id, entry);
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
      .map(([id, entry]) => ({
        id,
        name: entry.name,
        description: entry.description,
        source: this.source,
        installed: true,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async remove(
    pkg: SoftwareItem,
    options?: SoftwareOperationOptions,
  ): Promise<"removed" | "not-installed"> {
    const id = pkg.id;
    assertPackageId(id);
    await requireAptExecutable(
      APT_GET,
      "APT removal is not available",
    );

    if (pkg.source !== this.source) {
      return "not-installed";
    }

    const installedIds = await this.getInstalledPackageIds([id]);
    if (installedIds.size === 0) return "not-installed";

    const targetId = resolveInstalledAptPackageId(id, installedIds);
    if (!targetId) {
      throw new AptOperationError(
        "unsafe",
        "Removal was blocked because the installed package architecture is ambiguous",
        [...installedIds].join("\n"),
      );
    }

    const metadata = await this.getInstalledMetadata([targetId]);
    if (!isConservativeRemovalCandidate(metadata.get(targetId))) {
      throw new AptOperationError(
        "unsafe",
        "This package is protected from removal",
      );
    }

    const simulation = await runProcess(
      APT_GET,
      ["--simulate", "--no-auto-remove", "remove", "--", targetId],
      { env: C_LOCALE_ENV, maxOutputBytes: 1024 * 1024 },
    );
    const planned = [...new Set(parseAptRemovalSimulation(simulation.stdout))];
    const removalPlan = inspectAptRemovalPlan(targetId, planned);
    if (!removalPlan.includesTarget) {
      throw new AptOperationError(
        "failed",
        "APT could not prepare this removal",
        summarizeProcessOutput(simulation.stderr || simulation.stdout),
      );
    }

    if (removalPlan.additionalIds.length > 0) {
      throw new AptOperationError(
        "unsafe",
        "Removal was blocked because other software would also be removed",
        removalPlan.additionalIds.join("\n"),
      );
    }

    await runAptTransaction({
      aptDaemonRequest: { kind: "remove-packages", packageIds: [targetId] },
      directExecutable: APT_GET,
      directArgs: ["--yes", "--no-auto-remove", "remove", "--", targetId],
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

  async listUpdates(signal?: AbortSignal): Promise<SoftwareUpdate[]> {
    await requireAptExecutable(
      APT,
      "APT update information is not available",
    );

    const result = await runProcess(
      APT,
      ["list", "--upgradable"],
      {
        signal,
        env: C_LOCALE_ENV,
        maxOutputBytes: 2 * 1024 * 1024,
        timeoutMs: 20_000,
      },
    );

    return parseAptUpgradableOutput(result.stdout)
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
    if (pkg.source !== this.source) {
      throw new AptOperationError("not-found", "Invalid APT update target");
    }
    assertPackageId(pkg.id);
    if (!(await this.isInstalled(pkg.id))) {
      throw new AptOperationError("not-found", "APT package is not installed");
    }

    await runAptTransaction({
      aptDaemonRequest: { kind: "upgrade-packages", packageIds: [pkg.id] },
      directExecutable: APT_GET,
      directArgs: [
        "--yes",
        "--no-remove",
        "--only-upgrade",
        "install",
        "--",
        pkg.id,
      ],
      simulationArgs: [
        "--simulate",
        "--no-remove",
        "--only-upgrade",
        "install",
        "--",
        pkg.id,
      ],
      unavailableMessage: "APT package management is not available",
      cancelledMessage: "Update was cancelled",
      failureMessage: "Package update failed",
    }, options);
  }

  async updateAll(options?: SoftwareOperationOptions): Promise<void> {
    const updates = await this.listUpdates();
    if (updates.length === 0) return;
    await runAptTransaction({
      aptDaemonRequest: {
        kind: "upgrade-packages",
        packageIds: updates.map((update) => update.id),
      },
      directExecutable: APT_GET,
      directArgs: ["--yes", "--no-remove", "upgrade"],
      simulationArgs: ["--simulate", "--no-remove", "upgrade"],
      unavailableMessage: "APT package management is not available",
      cancelledMessage: "Update was cancelled",
      failureMessage: "APT update failed",
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
    await requireAptExecutable(
      DPKG_QUERY,
      "Installed package state is not available",
    );

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

    return parseDpkgStatusOutput(result.stdout);
  }

  private async hasCandidate(id: string): Promise<boolean> {
    const result = await runProcess(APT_CACHE, ["policy", "--", id], {
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
  ) {
    if (ids.length === 0) return new Map();
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
    return parseDpkgInstalledMetadata(result.stdout);
  }
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

async function requireAptExecutable(path: string, message: string): Promise<void> {
  try {
    await requireExecutable(path);
  } catch (error) {
    throw new AptOperationError("unavailable", message, String(error));
  }
}

function assertPackageId(id: string): void {
  if (!isValidAptPackageId(id)) {
    throw new AptOperationError("not-found", "Invalid APT package ID");
  }
}

export const aptBackend = new AptBackend();
