import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  integrateAppImage,
  parseSquashfsListing,
} from "../src/local-packages/appimage.ts";
import type { LocalAppImage } from "../src/local-packages/types.ts";

test("parses regular files and links from unsquashfs listings", () => {
  const output = [
    "lrwxrwxrwx root/root 9 2026-01-01 00:00 squashfs-root/.DirIcon -> App.png",
    "-rw-r--r-- root/root 42 2026-01-01 00:00 squashfs-root/App.png",
    "drwxr-xr-x root/root 0 2026-01-01 00:00 squashfs-root/usr",
  ].join("\n");
  assert.deepEqual(parseSquashfsListing(output), [
    { path: ".DirIcon", type: "symlink", target: "App.png" },
    { path: "App.png", type: "file", target: undefined },
    { path: "usr", type: "directory", target: undefined },
  ]);
});

test("integrates an AppImage atomically with a desktop entry and record", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-integration-test-"));
  try {
    const source = join(root, 'My "Cool" Ω App (1).AppImage');
    await writeFile(source, makeType2AppImageHeader(), { mode: 0o600 });
    const applications = join(root, "Applications");
    const desktopEntries = join(root, "local share", "applications");
    const support = join(root, "support");
    const pkg = await fixturePackage(source, "Cool App");

    const outcome = await integrateAppImage(pkg, {
      applicationsDirectory: applications,
      desktopEntriesDirectory: desktopEntries,
      supportPath: support,
      refreshDesktopDatabase: false,
    });

    assert.equal(outcome.status, "integrated");
    assert.equal(outcome.managedPath, join(applications, "Cool App.AppImage"));
    const installedStat = await lstat(outcome.managedPath!);
    assert.notEqual(installedStat.mode & 0o100, 0);

    const id = createHash("sha256").update(outcome.managedPath!).digest("hex").slice(0, 20);
    const desktopPath = join(desktopEntries, `depot-appimage-${id}.desktop`);
    const desktop = await readFile(desktopPath, "utf8");
    assert.match(desktop, /Name=Cool App/);
    assert.match(desktop, /Exec=".*\/Applications\/Cool App\.AppImage"/);
    assert.match(desktop, /X-Depot-Managed=true/);

    const record = JSON.parse(
      await readFile(join(support, "appimages", `${id}.json`), "utf8"),
    );
    assert.equal(record.managedPath, outcome.managedPath);
    assert.equal(record.source, "local-file");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses a unique filename instead of overwriting an existing AppImage", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-duplicate-test-"));
  try {
    const source = join(root, "source.AppImage");
    await writeFile(source, makeType2AppImageHeader());
    const applications = join(root, "Applications");
    await mkdir(applications);
    await writeFile(join(applications, "Example.AppImage"), "keep me");

    const outcome = await integrateAppImage(await fixturePackage(source, "Example"), {
      applicationsDirectory: applications,
      desktopEntriesDirectory: join(root, "desktop"),
      supportPath: join(root, "support"),
      refreshDesktopDatabase: false,
    });
    assert.equal(outcome.managedPath, join(applications, "Example-2.AppImage"));
    assert.equal(await readFile(join(applications, "Example.AppImage"), "utf8"), "keep me");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleans up the managed AppImage if desktop entry creation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-cleanup-test-"));
  try {
    const source = join(root, "source.AppImage");
    await writeFile(source, makeType2AppImageHeader());
    const applications = join(root, "Applications");
    const desktopEntries = join(root, "desktop");
    await mkdir(applications);
    await mkdir(desktopEntries);
    const managedPath = join(applications, "Cleanup.AppImage");
    const id = createHash("sha256").update(managedPath).digest("hex").slice(0, 20);
    await writeFile(join(desktopEntries, `depot-appimage-${id}.desktop`), "occupied");

    await assert.rejects(
      integrateAppImage(await fixturePackage(source, "Cleanup"), {
        applicationsDirectory: applications,
        desktopEntriesDirectory: desktopEntries,
        supportPath: join(root, "support"),
        refreshDesktopDatabase: false,
      }),
      /cleaned up/,
    );
    await assert.rejects(access(managedPath, constants.F_OK));
    assert.deepEqual(await readdir(join(root, "support", "appimages")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixturePackage(
  source: string,
  name: string,
): Promise<LocalAppImage> {
  const stat = await lstat(source);
  return {
    kind: "appimage",
    appImageType: 2,
    filePath: source,
    fileName: source.split("/").at(-1)!,
    fileSize: stat.size,
    contentHash: createHash("sha256").update(await readFile(source)).digest("hex"),
    name,
    description: "Test AppImage",
    architecture: "x86_64",
    installed: false,
  };
}

function makeType2AppImageHeader(): Buffer {
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
