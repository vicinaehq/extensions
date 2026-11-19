import assert from "node:assert/strict";
import test from "node:test";
import {
  compareCleanupPlan,
  isPartialCachePermissionFailure,
  parseAptAutocleanSimulation,
  parseAptAutoremoveSimulation,
  parseFlatpakUnusedPreview,
} from "../src/backends/cleanup-parsing.ts";

test("parses purged and removed packages from an APT cleanup simulation", () => {
  const plan = parseAptAutoremoveSimulation(`
The following packages will be REMOVED:
  old-runtime* unused-library
After this operation, 127 MB disk space will be freed.
Purg old-runtime [1.0]
Remv unused-library:amd64 [2.0]
`);

  assert.deepEqual(plan, {
    packageIds: ["old-runtime", "unused-library:amd64"],
    reclaimableSpace: "127 MB",
  });
});

test("parses obsolete APT archives without trusting malformed identifiers", () => {
  assert.deepEqual(
    parseAptAutocleanSimulation(`
Del example 2.0-1 [42.3 MB]
Del library:amd64 1.2 [512 kB]
Del bad$id 1.0 [1 B]
`),
    [
      { packageId: "example", version: "2.0-1", size: "42.3 MB" },
      { packageId: "library:amd64", version: "1.2", size: "512 kB" },
    ],
  );
});

test("parses Flatpak's declined unused-runtime transaction preview", () => {
  const output = `
        ID                                      Branch     Op
 1.     org.freedesktop.Platform               24.08      r
 2.     org.freedesktop.Platform.GL.default    24.08      r
 3.     org.freedesktop.Platform.GL.default    25.08      r

Proceed with these changes to the user installation? [Y/n]:
`;

  assert.deepEqual(parseFlatpakUnusedPreview(output, "user"), [
    { id: "org.freedesktop.Platform", scope: "user", branch: "24.08" },
    {
      id: "org.freedesktop.Platform.GL.default",
      scope: "user",
      branch: "24.08",
    },
    {
      id: "org.freedesktop.Platform.GL.default",
      scope: "user",
      branch: "25.08",
    },
  ]);
});

test("ignores Flatpak headings, prompts, and non-removal rows", () => {
  assert.deepEqual(
    parseFlatpakUnusedPreview(`
ID Branch Op
1. org.example.Runtime stable i
Nothing unused to uninstall
`, "system"),
    [],
  );
});

test("treats only the unreadable partial-download cache as limited", () => {
  // Real unprivileged `apt-get --simulate autoclean` output (exit 100).
  const limited = `NOTE: This is only a simulation!
Reading package lists...
Del example 2.0-1 [42.3 MB]
E: Unable to read /var/cache/apt/archives/partial/ - open (13: Permission denied)`;
  assert.equal(isPartialCachePermissionFailure(limited), true);
  assert.deepEqual(parseAptAutocleanSimulation(limited), [
    { packageId: "example", version: "2.0-1", size: "42.3 MB" },
  ]);
  assert.equal(
    isPartialCachePermissionFailure(
      `${limited}\nE: The package lists or status file could not be parsed or opened.`,
    ),
    false,
  );
  assert.equal(
    isPartialCachePermissionFailure(
      "E: Unable to read /var/cache/apt/archives/ - open (13: Permission denied)",
    ),
    false,
  );
  assert.equal(isPartialCachePermissionFailure("Reading package lists..."), false);
});

test("requires the purge simulation to match the reviewed packages exactly", () => {
  // Real `apt-get --simulate --yes --no-auto-remove purge -- libjcat1` line.
  assert.deepEqual(
    compareCleanupPlan(["libjcat1"], "Purg libjcat1 [0.2.5-1build1]\n"),
    { unexpected: [], missing: [] },
  );
  assert.deepEqual(
    compareCleanupPlan(
      ["libjcat1", "old-lib"],
      "Purg libjcat1 [0.2.5-1build1]\nPurg fwupd [2.1.1-1ubuntu3.1]\n",
    ),
    { unexpected: ["fwupd"], missing: ["old-lib"] },
  );
});
