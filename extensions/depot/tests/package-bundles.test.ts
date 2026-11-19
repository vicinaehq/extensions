import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILT_IN_BUNDLES,
  createPackageListBundle,
  resolvedBundlePackage,
} from "../src/package-bundles.ts";

test("ships a small valid built-in bundle catalog", () => {
  assert.deepEqual(
    BUILT_IN_BUNDLES.map((bundle) => bundle.name),
    ["Developer Essentials", "Creative Studio"],
  );
  for (const bundle of BUILT_IN_BUNDLES) {
    assert.ok(bundle.packages.length > 0);
    assert.equal(
      new Set(bundle.packages.map((pkg) => `${pkg.source}:${pkg.id}`)).size,
      bundle.packages.length,
    );
  }
});

test("creates a package list from space, comma, and line separators", () => {
  const bundle = createPackageListBundle(
    "git curl,build-essential\nffmpeg",
    "org.gimp.GIMP, org.inkscape.Inkscape",
  );

  assert.deepEqual(bundle.packages, [
    { source: "apt", id: "git" },
    { source: "apt", id: "curl" },
    { source: "apt", id: "build-essential" },
    { source: "apt", id: "ffmpeg" },
    { source: "flatpak", id: "org.gimp.GIMP" },
    { source: "flatpak", id: "org.inkscape.Inkscape" },
  ]);
});

test("rejects empty, duplicate, and unsafe package lists", () => {
  assert.throws(
    () => createPackageListBundle("", ""),
    /at least one/i,
  );
  assert.throws(
    () => createPackageListBundle("git git", ""),
    /duplicate package ID/i,
  );
  assert.throws(
    () => createPackageListBundle("git;touch", ""),
    /invalid APT package ID/i,
  );
  assert.throws(
    () => createPackageListBundle("", "org.example.App;touch"),
    /invalid Flatpak package ID/i,
  );
});

test("classifies available and installed bundle packages", () => {
  const entry = { source: "apt" as const, id: "git" };
  assert.equal(resolvedBundlePackage(entry).status, "unavailable");
  assert.equal(resolvedBundlePackage(entry, {
    id: "git",
    name: "Git",
    description: "Version control",
    source: "apt",
    installed: false,
  }).status, "available");
  assert.equal(resolvedBundlePackage(entry, {
    id: "git",
    name: "Git",
    description: "Version control",
    source: "apt",
    installed: true,
  }).status, "installed");
});
