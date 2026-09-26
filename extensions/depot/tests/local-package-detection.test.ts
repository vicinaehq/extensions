import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  inspectLocalPackage,
  installLocalPackage,
} from "../src/local-packages/index.ts";
import { LocalPackageError } from "../src/local-packages/types.ts";

test("rejects a random executable renamed to AppImage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depot-detection-test-"));
  try {
    const filePath = join(directory, "Not Really.AppImage");
    await writeFile(filePath, Buffer.from("#!/bin/sh\necho nope\n"), { mode: 0o700 });
    await assert.rejects(
      inspectLocalPackage(filePath, { flatpakScope: "user" }),
      (error: unknown) => error instanceof LocalPackageError &&
        error.kind === "invalid" && /valid AppImage/.test(error.message),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects a Flatpak reference by content with a nonstandard filename", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depot-flatpakref-test-"));
  try {
    const filePath = join(directory, "download with spaces");
    await writeFile(filePath, [
      "[Flatpak Ref]",
      "Version=1",
      "Name=org.example.LocalApp",
      "Title=Local App",
      "Url=https://example.com/repo/",
    ].join("\n"));
    const pkg = await inspectLocalPackage(filePath, { flatpakScope: "user" });
    assert.equal(pkg.kind, "flatpakref");
    assert.equal(pkg.name, "Local App");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects symbolic links and files changed after review", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depot-file-safety-test-"));
  try {
    const filePath = join(directory, "portable-app");
    await writeFile(filePath, makeType2AppImage());
    const linkPath = join(directory, "linked.AppImage");
    await symlink(filePath, linkPath);
    await assert.rejects(
      inspectLocalPackage(linkPath, { flatpakScope: "user" }),
      /symbolic link/,
    );

    const pkg = await inspectLocalPackage(filePath, { flatpakScope: "user" });
    await appendFile(filePath, "changed");
    await assert.rejects(
      installLocalPackage(pkg, {
        appImageSupportPath: join(directory, "support"),
        applicationsDirectory: join(directory, "Applications"),
        desktopEntriesDirectory: join(directory, "desktop"),
      }),
      /changed after it was inspected/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
