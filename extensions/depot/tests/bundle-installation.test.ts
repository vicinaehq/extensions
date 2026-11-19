import assert from "node:assert/strict";
import test from "node:test";
import {
  bundleInstallFeedback,
  bundleRecentActions,
  installBundlePackages,
  resolveBundle,
  soleBatchFailure,
  type BundleBackends,
} from "../src/bundle-installation.ts";
import { DepotOperationError } from "../src/errors.ts";
import { createPackageListBundle } from "../src/package-bundles.ts";
import type {
  SoftwareInstallBatchOutcome,
  SoftwareItem,
} from "../src/types.ts";

function aptPackage(id: string): SoftwareItem {
  return { id, name: id, description: "", source: "apt", installed: false };
}

function flatpakPackage(id: string): SoftwareItem {
  return {
    id,
    name: id,
    description: "",
    source: "flatpak",
    installed: false,
    flatpak: { remote: "flathub", scope: "user" },
  };
}

function fakeBackends(overrides: {
  apt?: (packages: readonly SoftwareItem[]) => Promise<SoftwareInstallBatchOutcome>;
  flatpak?: (packages: readonly SoftwareItem[]) => Promise<SoftwareInstallBatchOutcome>;
  getDetails?: (id: string) => Promise<SoftwareItem>;
  resolvePackageIds?: (ids: readonly { id: string }[]) => Promise<Map<string, SoftwareItem>>;
} = {}): BundleBackends & { calls: string[][] } {
  const calls: string[][] = [];
  const installAll = async (packages: readonly SoftwareItem[]) => ({
    installedIds: packages.map((pkg) => pkg.id),
    alreadyInstalledIds: [],
    missingIds: [],
  });
  const record = (
    install: (packages: readonly SoftwareItem[]) => Promise<SoftwareInstallBatchOutcome>,
  ) => (packages: readonly SoftwareItem[]) => {
    calls.push(packages.map((pkg) => `${pkg.source}:${pkg.id}`));
    return install(packages);
  };
  return {
    calls,
    apt: {
      installMany: record(overrides.apt ?? installAll),
      getDetails: overrides.getDetails ?? (async (id) => aptPackage(id)),
    },
    flatpak: {
      installMany: record(overrides.flatpak ?? installAll),
      resolvePackageIds: overrides.resolvePackageIds ??
        (async (requests) =>
          new Map(requests.map(({ id }) => [id, flatpakPackage(id)]))),
    },
  };
}

test("installs one batch per backend", async () => {
  const backends = fakeBackends();
  const result = await installBundlePackages([
    aptPackage("git"),
    flatpakPackage("org.gimp.GIMP"),
    aptPackage("curl"),
  ], backends);

  assert.deepEqual(backends.calls, [
    ["apt:git", "apt:curl"],
    ["flatpak:org.gimp.GIMP"],
  ]);
  assert.equal(result.installed.length, 3);
  assert.deepEqual(bundleInstallFeedback("Bundle", result), {
    status: "success",
    title: "Bundle installed",
    message: "3 packages installed",
  });
});

test("accounts for packages a finished transaction did not install", async () => {
  const backends = fakeBackends({
    apt: async () => ({
      installedIds: ["git"],
      alreadyInstalledIds: ["curl"],
      missingIds: ["ffmpeg"],
    }),
  });
  const result = await installBundlePackages(
    [aptPackage("git"), aptPackage("curl"), aptPackage("ffmpeg")],
    backends,
  );

  assert.deepEqual(result.installed.map((pkg) => pkg.id), ["git"]);
  assert.deepEqual(result.alreadyInstalled.map((pkg) => pkg.id), ["curl"]);
  assert.deepEqual(result.missing.map((pkg) => pkg.id), ["ffmpeg"]);
  assert.equal(soleBatchFailure(result), undefined);

  const feedback = bundleInstallFeedback("Bundle", result);
  assert.equal(feedback.status, "failure");
  assert.equal(feedback.title, "Bundle partially installed: 2 of 3");
  assert.match(feedback.message, /Not installed: ffmpeg\./);

  assert.deepEqual(
    bundleRecentActions("Bundle", result).map((action) =>
      [action.kind, action.identifier, action.source]
    ),
    [["installed", "git", "APT"], ["failed", "ffmpeg", "APT"]],
  );
});

test("keeps the other backend's results when one batch fails", async () => {
  const backends = fakeBackends({
    apt: async () => {
      throw new DepotOperationError(
        "AptOperationError",
        "failed",
        "Package installation failed",
        "E: Unable to fetch\nE: Network unreachable",
      );
    },
  });
  const result = await installBundlePackages(
    [aptPackage("git"), flatpakPackage("org.gimp.GIMP")],
    backends,
  );

  assert.deepEqual(result.installed.map((pkg) => pkg.id), ["org.gimp.GIMP"]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.error.message, "APT: Package installation failed");
  assert.equal(
    result.failures[0]?.error.technicalDetails,
    "E: Unable to fetch\nE: Network unreachable",
  );

  const feedback = bundleInstallFeedback("Bundle", result);
  assert.equal(feedback.title, "Bundle partially installed: 1 of 2");
  assert.match(feedback.message, /APT: Package installation failed\./);
  assert.match(feedback.message, /Not installed: git\./);

  const failed = bundleRecentActions("Bundle", result).find((action) =>
    action.kind === "failed"
  );
  assert.deepEqual(failed, {
    kind: "failed",
    name: "Bundle",
    identifier: "git",
    source: "APT",
    summary: "APT: Package installation failed",
    details: "E: Unable to fetch\nE: Network unreachable",
  });
});

test("reports a whole failed batch on its own", async () => {
  const backends = fakeBackends({
    flatpak: async () => {
      throw new Error("remote unreachable");
    },
  });
  const result = await installBundlePackages(
    [flatpakPackage("org.gimp.GIMP")],
    backends,
  );
  const failure = soleBatchFailure(result);

  assert.equal(failure?.source, "flatpak");
  assert.equal(failure?.error.message, "Flatpak: Installation failed");
  assert.equal(failure?.error.technicalDetails, "remote unreachable");
});

test("cancellation stops later batches but keeps completed results", async () => {
  const backends = fakeBackends({
    flatpak: async () => {
      throw new DepotOperationError("FlatpakOperationError", "cancelled", "Cancelled");
    },
  });
  const cancelledFirst = fakeBackends({
    apt: async () => {
      throw new DOMException("Aborted", "AbortError");
    },
  });

  const result = await installBundlePackages(
    [aptPackage("git"), flatpakPackage("org.gimp.GIMP")],
    backends,
  );
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.installed.map((pkg) => pkg.id), ["git"]);
  assert.equal(result.failures.length, 0);

  const stopped = await installBundlePackages(
    [aptPackage("git"), flatpakPackage("org.gimp.GIMP")],
    cancelledFirst,
  );
  assert.equal(stopped.cancelled, true);
  assert.deepEqual(cancelledFirst.calls, [["apt:git"]]);
  assert.deepEqual(bundleRecentActions("Bundle", stopped), []);
});

test("resolves bundle packages and marks disabled or unavailable backends", async () => {
  const bundle = createPackageListBundle("git missing", "org.gimp.GIMP");
  const backends = fakeBackends({
    getDetails: async (id) => {
      if (id === "missing") {
        throw new DepotOperationError("AptOperationError", "not-found", "APT package not found");
      }
      return { ...aptPackage(id), installed: true };
    },
  });

  const resolved = await resolveBundle(
    bundle,
    backends,
    { aptEnabled: true, flatpakEnabled: false },
    new AbortController().signal,
  );
  assert.deepEqual(
    resolved.map((item) => [item.entry.id, item.status, item.message]),
    [
      ["git", "installed", undefined],
      ["missing", "unavailable", "APT package not found"],
      ["org.gimp.GIMP", "unsupported", "Flatpak is disabled in Depot preferences"],
    ],
  );

  const flatpakMissing = fakeBackends({
    resolvePackageIds: async () => {
      throw new DepotOperationError("FlatpakOperationError", "unavailable", "Flatpak is not installed");
    },
  });
  const [, , flatpak] = await resolveBundle(
    bundle,
    flatpakMissing,
    { aptEnabled: true, flatpakEnabled: true },
    new AbortController().signal,
  );
  assert.equal(flatpak?.status, "unsupported");
  assert.equal(flatpak?.message, "Flatpak is not installed");
});

test("keeps installed Flatpak groups when a later group fails", async () => {
  const backends = fakeBackends({
    flatpak: async () => ({
      installedIds: ["org.example.First"],
      alreadyInstalledIds: [],
      missingIds: ["org.example.Second"],
      failure: new DepotOperationError(
        "FlatpakOperationError",
        "failed",
        "Flatpak installation failed",
        "error: remote unreachable",
      ),
    }),
  });
  const result = await installBundlePackages(
    [flatpakPackage("org.example.First"), flatpakPackage("org.example.Second")],
    backends,
  );

  assert.deepEqual(result.installed.map((pkg) => pkg.id), ["org.example.First"]);
  assert.deepEqual(result.missing, []);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(
    result.failures[0]!.packages.map((pkg) => pkg.id),
    ["org.example.Second"],
  );
  assert.match(result.failures[0]!.error.message, /^Flatpak: /);
});
