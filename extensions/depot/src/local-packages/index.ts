import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  open,
  readFile,
  rmdir,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import type { FlatpakScope, SoftwareOperationOptions } from "../types";
import { inspectAppImage, integrateAppImage } from "./appimage.ts";
import { inspectDebPackage, installDebPackage } from "./deb.ts";
import {
  inspectFlatpakBundle,
  inspectFlatpakRef,
  installFlatpakFile,
} from "./flatpak.ts";
import { isDebianArchiveHeader, looksLikeFlatpakRef } from "./parsing.ts";
import {
  LocalPackageError,
  type LocalInstallOutcome,
  type LocalPackage,
} from "./types.ts";

export interface LocalPackageInspectionOptions {
  flatpakScope: FlatpakScope;
  signal?: AbortSignal;
}

export interface LocalPackageInstallOptions extends SoftwareOperationOptions {
  appImageSupportPath: string;
  applicationsDirectory?: string;
  desktopEntriesDirectory?: string;
}

export async function inspectLocalPackage(
  selectedPath: string,
  options: LocalPackageInspectionOptions,
): Promise<LocalPackage> {
  const filePath = resolve(selectedPath);
  let stat;
  try {
    stat = await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new LocalPackageError("invalid", "The selected file no longer exists");
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new LocalPackageError("invalid", "Select a regular package file, not a directory or symbolic link");
  }
  if (stat.size <= 0) {
    throw new LocalPackageError("invalid", "The selected file is empty");
  }

  const fileName = basename(filePath);
  const contentHash = await hashFile(filePath, options.signal);
  const header = await readHeader(filePath, 128);
  options.signal?.throwIfAborted();

  let pkg: LocalPackage;
  if (isDebianArchiveHeader(header)) {
    pkg = await inspectDebPackage(
      filePath,
      fileName,
      stat.size,
      contentHash,
      options.signal,
    );
  } else if (
    header[0] === 0x7f &&
    header[1] === 0x45 &&
    header[2] === 0x4c &&
    header[3] === 0x46 &&
    header[8] === 0x41 &&
    header[9] === 0x49
  ) {
    pkg = await inspectAppImage(
      filePath,
      fileName,
      stat.size,
      contentHash,
      options.signal,
    );
  } else {
    const extension = extname(fileName).toLowerCase();
    let flatpakReference = false;
    if (stat.size <= 1024 * 1024) {
      const content = await readFile(filePath, "utf8");
      options.signal?.throwIfAborted();
      flatpakReference = looksLikeFlatpakRef(content);
    }

    if (flatpakReference) {
      pkg = await inspectFlatpakRef(
        filePath,
        fileName,
        stat.size,
        contentHash,
        options.flatpakScope,
        options.signal,
      );
    } else if (extension === ".flatpak") {
      pkg = await inspectFlatpakBundle(
        filePath,
        fileName,
        stat.size,
        contentHash,
        options.flatpakScope,
        options.signal,
      );
    } else {
      const expectedType = new Map<string, string>([
        [".deb", "Debian package"],
        [".flatpakref", "Flatpak reference"],
        [".appimage", "AppImage"],
      ]).get(extension);
      throw new LocalPackageError(
        extension === ".flatpak" || expectedType ? "invalid" : "unsupported",
        expectedType
          ? `This file is not a valid ${expectedType}`
          : "Supported local formats are .deb, .flatpak, .flatpakref, and AppImage",
      );
    }
  }

  await assertSameFile(filePath, stat);
  return pkg;
}

export async function installLocalPackage(
  pkg: LocalPackage,
  options: LocalPackageInstallOptions,
): Promise<LocalInstallOutcome> {
  const staged = await stageReviewedPackage(pkg, options.signal);
  const stagedPackage: LocalPackage = { ...pkg, filePath: staged.filePath };
  try {
    switch (stagedPackage.kind) {
      case "deb":
        return installDebPackage(stagedPackage, options);
      case "flatpak-bundle":
      case "flatpakref":
        options.onStatus?.({
          message: "Installing with Flatpak",
          cancellable: false,
        });
        return installFlatpakFile(stagedPackage);
      case "appimage":
        options.onStatus?.({
          message: "Integrating AppImage",
          cancellable: false,
        });
        return integrateAppImage(stagedPackage, {
          supportPath: options.appImageSupportPath,
          applicationsDirectory: options.applicationsDirectory,
          desktopEntriesDirectory: options.desktopEntriesDirectory,
        });
    }
  } finally {
    await removeStagedPackage(staged.directory, staged.filePath);
  }
}

export function localPackageSourceLabel(pkg: LocalPackage): string {
  switch (pkg.kind) {
    case "deb":
      return "APT · Local file";
    case "flatpak-bundle":
      return `Flatpak bundle · ${scopeLabel(pkg.scope)}`;
    case "flatpakref":
      return `Flatpak reference · ${scopeLabel(pkg.scope)}`;
    case "appimage":
      return "AppImage · Local file";
  }
}

export function localPackageIdentifier(pkg: LocalPackage): string | undefined {
  if (pkg.kind === "deb") return pkg.packageId;
  if (pkg.kind === "flatpak-bundle" || pkg.kind === "flatpakref") {
    return pkg.appId;
  }
  return undefined;
}

export function localPackageActionLabel(pkg: LocalPackage): string {
  return pkg.kind === "appimage" ? "Integrate AppImage" : "Install";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

async function readHeader(filePath: string, length: number): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function assertSameFile(
  filePath: string,
  original: Awaited<ReturnType<typeof lstat>>,
): Promise<void> {
  let current;
  try {
    current = await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new LocalPackageError("invalid", "The selected file no longer exists");
    }
    throw error;
  }
  if (
    !current.isFile() ||
    current.isSymbolicLink() ||
    current.dev !== original.dev ||
    current.ino !== original.ino ||
    current.size !== original.size ||
    current.mtimeMs !== original.mtimeMs ||
    current.ctimeMs !== original.ctimeMs
  ) {
    throw new LocalPackageError(
      "invalid",
      "The selected file changed while it was inspected; inspect it again before installing",
    );
  }
}

async function stageReviewedPackage(
  pkg: LocalPackage,
  signal?: AbortSignal,
): Promise<{ directory: string; filePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "depot-local-install-"));
  const filePath = join(directory, pkg.fileName);
  try {
    signal?.throwIfAborted();
    const contentHash = await copyAndHashFile(pkg.filePath, filePath, signal);
    const stat = await lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || contentHash !== pkg.contentHash) {
      throw new LocalPackageError(
        "invalid",
        "The selected file changed after it was inspected; inspect it again before installing",
      );
    }
    return { directory, filePath };
  } catch (error) {
    await removeStagedPackage(directory, filePath);
    throw error;
  }
}

async function copyAndHashFile(
  sourcePath: string,
  destinationPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const source = await open(sourcePath, "r");
  let destination: Awaited<ReturnType<typeof open>> | undefined;
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let readPosition = 0;
  try {
    destination = await open(destinationPath, "wx", 0o400);
    while (true) {
      signal?.throwIfAborted();
      const { bytesRead } = await source.read(
        buffer,
        0,
        buffer.length,
        readPosition,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) {
        const result = await destination.write(
          buffer,
          written,
          bytesRead - written,
        );
        written += result.bytesWritten;
      }
      readPosition += bytesRead;
    }
    return hash.digest("hex");
  } finally {
    await Promise.all([source.close(), destination?.close()]);
  }
}

async function removeStagedPackage(directory: string, filePath: string): Promise<void> {
  await unlink(filePath).catch(() => undefined);
  await rmdir(directory).catch(() => undefined);
}

async function hashFile(filePath: string, signal?: AbortSignal): Promise<string> {
  const handle = await open(filePath, "r");
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let position = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

function scopeLabel(scope: FlatpakScope): string {
  return scope === "user" ? "User" : "System";
}

export * from "./types.ts";
