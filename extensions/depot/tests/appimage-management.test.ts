import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  listInstalledAppImages,
  removeInstalledAppImage,
} from "../src/appimages.ts";
import { integrateAppImage } from "../src/local-packages/appimage.ts";
import type { LocalAppImage } from "../src/local-packages/types.ts";

test("discovers valid direct AppImages without trusting filenames", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-appimage-discovery-"));
  try {
    const applications = join(root, "Applications");
    const support = join(root, "support");
    await mkdir(applications);
    await writeFile(join(applications, "Portable Tool"), makeType2AppImageHeader());
    await writeFile(join(applications, "fake.AppImage"), "not an AppImage");
    await mkdir(join(applications, "nested"));
    await writeFile(
      join(applications, "nested", "Hidden.AppImage"),
      makeType2AppImageHeader(),
    );
    await symlink(
      join(applications, "Portable Tool"),
      join(applications, "Linked.AppImage"),
    );

    const appImages = await listInstalledAppImages({
      supportPath: support,
      applicationsDirectory: applications,
      desktopEntriesDirectory: join(root, "desktop"),
    });

    assert.equal(appImages.length, 1);
    assert.equal(appImages[0]?.fileName, "Portable Tool");
    assert.equal(appImages[0]?.managedByDepot, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recognizes Depot records and removes only exact managed files", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-appimage-managed-"));
  try {
    const source = join(root, "source.AppImage");
    const applications = join(root, "Applications");
    const desktopEntries = join(root, "desktop");
    const support = join(root, "support");
    await writeFile(source, makeType2AppImageHeader());
    const pkg = await fixturePackage(source, "Managed Example");
    const outcome = await integrateAppImage(pkg, {
      supportPath: support,
      applicationsDirectory: applications,
      desktopEntriesDirectory: desktopEntries,
      refreshDesktopDatabase: false,
    });

    const [appImage] = await listInstalledAppImages({
      supportPath: support,
      applicationsDirectory: applications,
      desktopEntriesDirectory: desktopEntries,
    });
    assert.equal(appImage?.managedByDepot, true);
    assert.equal(appImage?.name, "Managed Example");

    let trashed: readonly string[] = [];
    await removeInstalledAppImage(appImage!, {
      supportPath: support,
      applicationsDirectory: applications,
      desktopEntriesDirectory: desktopEntries,
      refreshDesktopDatabase: false,
      moveToTrash: async (paths) => {
        trashed = paths;
      },
    });

    const id = createHash("sha256")
      .update(outcome.managedPath!)
      .digest("hex")
      .slice(0, 20);
    assert.deepEqual(new Set(trashed), new Set([
      outcome.managedPath!,
      join(desktopEntries, `depot-appimage-${id}.desktop`),
      join(support, "appimages", `${id}.json`),
    ]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("external AppImage removal targets only the selected file", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-appimage-external-"));
  try {
    const applications = join(root, "Applications");
    const support = join(root, "support");
    const filePath = join(applications, "External App.AppImage");
    await mkdir(applications);
    await writeFile(filePath, makeType2AppImageHeader());
    const [appImage] = await listInstalledAppImages({
      supportPath: support,
      applicationsDirectory: applications,
    });

    let trashed: readonly string[] = [];
    await removeInstalledAppImage(appImage!, {
      supportPath: support,
      applicationsDirectory: applications,
      refreshDesktopDatabase: false,
      moveToTrash: async (paths) => {
        trashed = paths;
      },
    });

    assert.deepEqual(trashed, [filePath]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an invalid record cannot claim ownership of an AppImage", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-appimage-record-"));
  try {
    const applications = join(root, "Applications");
    const support = join(root, "support");
    const records = join(support, "appimages");
    const filePath = join(applications, "Example.AppImage");
    await mkdir(applications);
    await mkdir(records, { recursive: true });
    await writeFile(filePath, makeType2AppImageHeader());
    const id = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
    await writeFile(join(records, `${id}.json`), JSON.stringify({
      version: 1,
      id,
      name: "Example",
      source: "local-file",
      managedPath: filePath,
      desktopEntryPath: "/tmp/not-owned.desktop",
      integratedAt: new Date().toISOString(),
    }));

    const [appImage] = await listInstalledAppImages({
      supportPath: support,
      applicationsDirectory: applications,
      desktopEntriesDirectory: join(root, "desktop"),
    });

    assert.equal(appImage?.managedByDepot, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a symlinked records directory cannot grant Depot ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-appimage-record-link-"));
  try {
    const applications = join(root, "Applications");
    const support = join(root, "support");
    const externalRecords = join(root, "external-records");
    const filePath = join(applications, "Example.AppImage");
    await mkdir(applications);
    await mkdir(support);
    await mkdir(externalRecords);
    await writeFile(filePath, makeType2AppImageHeader());
    const id = createHash("sha256").update(filePath).digest("hex").slice(0, 20);
    await writeFile(join(externalRecords, `${id}.json`), JSON.stringify({
      version: 1,
      id,
      name: "Example",
      source: "local-file",
      managedPath: filePath,
      desktopEntryPath: join(root, "desktop", `depot-appimage-${id}.desktop`),
      integratedAt: new Date().toISOString(),
    }));
    await symlink(externalRecords, join(support, "appimages"));

    const [appImage] = await listInstalledAppImages({
      supportPath: support,
      applicationsDirectory: applications,
      desktopEntriesDirectory: join(root, "desktop"),
    });

    assert.equal(appImage?.managedByDepot, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("removal refuses an AppImage that changed after discovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "depot-appimage-changed-"));
  try {
    const applications = join(root, "Applications");
    const support = join(root, "support");
    const filePath = join(applications, "Example.AppImage");
    await mkdir(applications);
    await writeFile(filePath, makeType2AppImageHeader());
    const [appImage] = await listInstalledAppImages({
      supportPath: support,
      applicationsDirectory: applications,
    });
    await writeFile(filePath, Buffer.concat([makeType2AppImageHeader(), Buffer.alloc(1)]));

    let called = false;
    await assert.rejects(
      removeInstalledAppImage(appImage!, {
        supportPath: support,
        applicationsDirectory: applications,
        refreshDesktopDatabase: false,
        moveToTrash: async () => {
          called = true;
        },
      }),
      /changed/,
    );
    assert.equal(called, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixturePackage(
  source: string,
  name: string,
): Promise<LocalAppImage> {
  const data = await readFile(source);
  return {
    kind: "appimage",
    appImageType: 2,
    filePath: source,
    fileName: source.split("/").at(-1)!,
    fileSize: data.length,
    contentHash: createHash("sha256").update(data).digest("hex"),
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
