import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { AptTransactionOptions } from "../src/backends/apt-transaction.ts";
import { debPackageAction } from "../src/local-packages/deb.ts";
import {
  inspectLocalPackage,
  installLocalPackage,
  localPackageActionLabel,
  localPackageBlockedReason,
} from "../src/local-packages/index.ts";
import type {
  LocalAppImage,
  LocalDebPackage,
  LocalFlatpakBundle,
} from "../src/local-packages/types.ts";

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "depot-staging-test-"));
  try {
    await mkdir(join(root, "staging"));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function fakeTool(path: string, lines: string[]): Promise<string> {
  await writeFile(path, ["#!/bin/sh", ...lines].join("\n"), { mode: 0o700 });
  return path;
}

function debFixture(root: string, filePath: string): LocalDebPackage {
  return {
    kind: "deb",
    action: "install",
    filePath,
    fileName: "Foo.DEB",
    fileSize: 11,
    contentHash: sha256("deb content"),
    packageId: "foo",
    name: "foo",
    description: "Fixture",
    version: "1.0",
    installed: false,
  };
}

test("stages .deb files as package.deb in a traversable per-install directory", async () => {
  await withRoot(async (root) => {
    // Content-detected archive without a .deb extension.
    const source = join(root, "foo-download");
    await writeFile(source, "deb content");
    const marker = join(root, "installed");
    const dpkgQuery = await fakeTool(join(root, "dpkg-query"), [
      `[ -f '${marker}' ] && printf 'ii \\t1.0\\n'`,
      "exit 0",
    ]);
    const seen: { options?: AptTransactionOptions; dirMode?: number; fileMode?: number } = {};

    const outcome = await installLocalPackage(debFixture(root, source), {
      supportPath: join(root, "support"),
      stagingParent: join(root, "staging"),
      debTools: {
        dpkgQuery,
        runTransaction: async (options) => {
          const stagedPath = options.directArgs.at(-1)!;
          seen.options = options;
          seen.dirMode = (await lstat(dirname(stagedPath))).mode & 0o777;
          seen.fileMode = (await lstat(stagedPath)).mode & 0o777;
          assert.equal(await readFile(stagedPath, "utf8"), "deb content");
          await writeFile(marker, "");
        },
      },
    });

    assert.deepEqual(outcome, { status: "installed" });
    const stagedPath = seen.options!.directArgs.at(-1)!;
    assert.match(stagedPath, /\/depot-install-[^/]+\/package\.deb$/);
    assert.equal(dirname(dirname(stagedPath)), join(root, "staging"));
    assert.deepEqual(seen.options!.directArgs, [
      "--yes", "--no-remove", "install", "--", stagedPath,
    ]);
    assert.deepEqual(seen.options!.simulationArgs, [
      "--simulate", "--yes", "--no-remove", "install", "--", stagedPath,
    ]);
    assert.equal(seen.options!.directExecutable, "/usr/bin/apt");
    assert.equal(seen.dirMode, 0o711);
    assert.equal(seen.fileMode, 0o444);
    assert.deepEqual(await readdir(join(root, "staging")), []);
  });
});

test("removes the staging directory when the package manager fails", async () => {
  await withRoot(async (root) => {
    const source = join(root, "Foo.DEB");
    await writeFile(source, "deb content");
    const dpkgQuery = await fakeTool(join(root, "dpkg-query"), ["exit 1"]);
    await assert.rejects(
      installLocalPackage(debFixture(root, source), {
        supportPath: join(root, "support"),
        stagingParent: join(root, "staging"),
        debTools: {
          dpkgQuery,
          runTransaction: () => Promise.reject(new Error("apt failed")),
        },
      }),
      /apt failed/,
    );
    assert.deepEqual(await readdir(join(root, "staging")), []);
  });
});

test("rejects a source replaced by a symbolic link after review", async () => {
  await withRoot(async (root) => {
    const source = join(root, "Foo.deb");
    const elsewhere = join(root, "elsewhere.deb");
    await writeFile(elsewhere, "deb content");
    await symlink(elsewhere, source);
    let ran = false;
    await assert.rejects(
      installLocalPackage(debFixture(root, source), {
        supportPath: join(root, "support"),
        stagingParent: join(root, "staging"),
        debTools: {
          dpkgQuery: await fakeTool(join(root, "dpkg-query"), ["exit 1"]),
          runTransaction: async () => {
            ran = true;
          },
        },
      }),
      /changed after it was inspected/,
    );
    assert.equal(ran, false);
    assert.deepEqual(await readdir(join(root, "staging")), []);
  });
});

test("stages Flatpak files owner-only and read-only", async () => {
  await withRoot(async (root) => {
    const source = join(root, "bundle.flatpak");
    await writeFile(source, "bundle");
    const log = join(root, "modes.log");
    const flatpak = await fakeTool(join(root, "flatpak"), [
      "case \"$1\" in",
      "  list) printf 'org.example.App\\t1.0\\tstable\\n' ;;",
      "  install)",
      "    eval staged=\\${$#}",
      `    stat -c '%a' "$(dirname "$staged")" "$staged" > '${log}' ;;`,
      "esac",
    ]);
    const pkg: LocalFlatpakBundle = {
      kind: "flatpak-bundle",
      action: "install",
      filePath: source,
      fileName: "bundle.flatpak",
      fileSize: 6,
      contentHash: sha256("bundle"),
      appId: "org.example.App",
      name: "Example",
      description: "Fixture",
      branch: "stable",
      scope: "user",
      installed: false,
    };
    await installLocalPackage(pkg, {
      supportPath: join(root, "support"),
      stagingParent: join(root, "staging"),
      flatpakExecutable: flatpak,
    });
    assert.deepEqual((await readFile(log, "utf8")).trim().split("\n"), ["700", "400"]);
    assert.deepEqual(await readdir(join(root, "staging")), []);
  });
});

test("integrated AppImages are executable and duplicates are detected", async () => {
  await withRoot(async (root) => {
    const content = makeType2AppImage();
    const source = join(root, "Tool.AppImage");
    await writeFile(source, content, { mode: 0o600 });
    const locations = {
      supportPath: join(root, "support"),
      applicationsDirectory: join(root, "Applications"),
      desktopEntriesDirectory: join(root, "desktop"),
    };
    const pkg: LocalAppImage = {
      kind: "appimage",
      action: "integrate",
      appImageType: 2,
      filePath: source,
      fileName: "Tool.AppImage",
      fileSize: content.length,
      contentHash: sha256(content),
      name: "Tool",
      description: "Fixture",
      installed: false,
    };

    const outcome = await installLocalPackage(pkg, {
      ...locations,
      stagingParent: join(root, "staging"),
    });
    assert.equal((await lstat(outcome.managedPath!)).mode & 0o777, 0o755);

    const again = await inspectLocalPackage(source, {
      flatpakScope: "user",
      appImageLocations: locations,
    });
    assert.equal(again.kind, "appimage");
    assert.equal(again.installed, true);
    assert.equal(again.kind === "appimage" && again.integratedPath, outcome.managedPath);
    assert.equal(again.action, "current");
    assert.equal(
      localPackageBlockedReason(again),
      `This AppImage is already integrated at ${outcome.managedPath}`,
    );

    // A different build with the same name may be integrated as another copy.
    const rebuilt = Buffer.concat([content, Buffer.from("rebuilt")]);
    await writeFile(source, rebuilt);
    const other = await inspectLocalPackage(source, {
      flatpakScope: "user",
      appImageLocations: locations,
    });
    assert.equal(other.action, "integrate");
    assert.equal(other.kind === "appimage" && other.integratedPath, outcome.managedPath);
    assert.equal(localPackageActionLabel(other), "Integrate Another Copy");
    assert.equal(localPackageBlockedReason(other), undefined);
  });
});

test("sweeps only this user's stale staging directories", async () => {
  await withRoot(async (root) => {
    const staging = join(root, "staging");
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const stale = join(staging, "depot-install-stale");
    const fresh = join(staging, "depot-install-fresh");
    const nested = join(staging, "depot-install-nested");
    const target = join(root, "target");
    for (const directory of [stale, fresh, join(nested, "sub"), target]) {
      await mkdir(directory, { recursive: true });
    }
    await writeFile(join(stale, "package.deb"), "leftover", { mode: 0o444 });
    await writeFile(join(target, "keep"), "keep");
    await symlink(target, join(staging, "depot-install-link"));
    for (const directory of [stale, nested, target]) await utimes(directory, old, old);

    const source = join(root, "Tool.AppImage");
    const content = makeType2AppImage();
    await writeFile(source, content);
    await installLocalPackage({
      kind: "appimage",
      action: "integrate",
      appImageType: 2,
      filePath: source,
      fileName: "Tool.AppImage",
      fileSize: content.length,
      contentHash: sha256(content),
      name: "Tool",
      description: "Fixture",
      installed: false,
    }, {
      supportPath: join(root, "support"),
      applicationsDirectory: join(root, "Applications"),
      desktopEntriesDirectory: join(root, "desktop"),
      stagingParent: staging,
    });

    assert.deepEqual((await readdir(staging)).sort(), [
      "depot-install-fresh",
      "depot-install-link",
      "depot-install-nested",
    ]);
    assert.equal(await readFile(join(target, "keep"), "utf8"), "keep");
  });
});

test("computes .deb actions with dpkg version ordering", async () => {
  await withRoot(async (root) => {
    // Minimal dpkg stand-in: "lt" uses sort -V, "eq" ignores a zero epoch.
    const dpkg = await fakeTool(join(root, "dpkg"), [
      "[ \"$1\" = --compare-versions ] || exit 2",
      "a=\"${2#0:}\"; b=\"${4#0:}\"",
      "case \"$3\" in",
      "  eq) [ \"$a\" = \"$b\" ] ;;",
      "  lt) [ \"$a\" != \"$b\" ] && [ \"$(printf '%s\\n%s\\n' \"$a\" \"$b\" | sort -V | head -n1)\" = \"$a\" ] ;;",
      "  *) exit 2 ;;",
      "esac",
    ]);
    assert.equal(await debPackageAction(undefined, "1.0", { dpkg }), "install");
    assert.equal(await debPackageAction("1.0", "1.0", { dpkg }), "current");
    assert.equal(await debPackageAction("1.0", "0:1.0", { dpkg }), "current");
    assert.equal(await debPackageAction("1.0", "1.2", { dpkg }), "upgrade");
    assert.equal(await debPackageAction("1.10", "1.9", { dpkg }), "downgrade");
  });
});

test("blocks same-version and downgrade installs before authentication", async () => {
  const deb: LocalDebPackage = {
    kind: "deb",
    action: "downgrade",
    filePath: "/nonexistent/package.deb",
    fileName: "foo.deb",
    fileSize: 1,
    contentHash: "0".repeat(64),
    packageId: "foo",
    name: "foo",
    description: "Fixture",
    version: "1.0",
    installed: true,
    installedVersion: "2.0",
  };
  assert.match(localPackageBlockedReason(deb)!, /2\.0 is newer than this file \(1\.0\)/);
  await assert.rejects(
    installLocalPackage(deb, { supportPath: "/nonexistent" }),
    /does not downgrade/,
  );
  assert.equal(
    localPackageBlockedReason({ ...deb, action: "current", installedVersion: "1.0" }),
    "foo 1.0 is already installed",
  );
  assert.equal(localPackageBlockedReason({ ...deb, action: "upgrade" }), undefined);
  assert.equal(localPackageActionLabel({ ...deb, action: "upgrade" }), "Upgrade");
});

function makeType2AppImage(): Buffer {
  const buffer = Buffer.alloc(288);
  buffer.set(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0x41, 0x49, 2, 0]));
  buffer.writeUInt16LE(62, 18);
  buffer.writeBigUInt64LE(128n, 40);
  buffer.writeUInt16LE(64, 58);
  buffer.writeUInt16LE(1, 60);
  buffer.write("hsqs", 192, "ascii");
  buffer.writeUInt32LE(131_072, 204);
  buffer.writeUInt16LE(4, 220);
  buffer.writeBigUInt64LE(96n, 232);
  return buffer;
}
