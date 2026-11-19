import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  flatpakPackageAction,
  installFlatpakFile,
} from "../src/local-packages/flatpak.ts";
import type { LocalFlatpakBundle } from "../src/local-packages/types.ts";

test("installs or updates a reviewed bundle when its ref already exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depot-local-flatpak-test-"));
  const executable = join(directory, "flatpak-fixture");
  const bundle = join(directory, "example.flatpak");
  const marker = join(directory, "updated");
  const log = join(directory, "install.log");
  try {
    await writeFile(bundle, "reviewed bundle");
    await writeFile(executable, [
      "#!/bin/sh",
      `marker='${marker}'`,
      `log='${log}'`,
      "case \"$1:$2\" in",
      "  list:--user)",
      "    if [ -f \"$marker\" ]; then",
      "      printf 'org.example.App\\t2.0\\tbeta\\n'",
      "    else",
      "      printf 'org.example.App\\t1.0\\tbeta\\n'",
      "    fi",
      "    ;;",
      "  install:--user) printf '%s\\n' \"$*\" > \"$log\"; touch \"$marker\" ;;",
      "  *) exit 1 ;;",
      "esac",
    ].join("\n"), { mode: 0o700 });

    const pkg: LocalFlatpakBundle = {
      kind: "flatpak-bundle",
      filePath: bundle,
      fileName: "example.flatpak",
      fileSize: 15,
      contentHash: "unused-by-installer",
      action: "update",
      appId: "org.example.App",
      name: "Example",
      description: "Example bundle",
      branch: "beta",
      scope: "user",
      installed: true,
      installedVersion: "1.0",
    };

    assert.deepEqual(await installFlatpakFile(pkg, { executable }), {
      status: "installed",
    });
    assert.match(
      await readFile(log, "utf8"),
      /install --user --noninteractive --assumeyes --or-update --bundle .*example\.flatpak/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("offers Flatpak files as install, update, or current by commit", () => {
  const commit = "d731fdcfccff83be93db05d30fe19dcf151fbafb01e3a8236f6a9be6066c2b41";
  assert.equal(flatpakPackageAction(undefined, commit), "install");
  // References have no local commit and are always offered as updates.
  assert.equal(
    flatpakPackageAction({ version: "1.0", activeCommit: "d731fdcfccff" }),
    "update",
  );
  assert.equal(flatpakPackageAction({ version: "1.0" }, commit), "update");
  assert.equal(
    flatpakPackageAction({ version: "1.0", activeCommit: "d731fdcfccff" }, commit),
    "current",
  );
  assert.equal(
    flatpakPackageAction({ version: "1.0", activeCommit: "0123456789ab" }, commit),
    "update",
  );
  // Too short to identify a build.
  assert.equal(
    flatpakPackageAction({ version: "1.0", activeCommit: "d731" }, commit),
    "update",
  );
});
