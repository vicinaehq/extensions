import { open, lstat, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
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
  const header = await readHeader(filePath, 128);
  options.signal?.throwIfAborted();

  if (isDebianArchiveHeader(header)) {
    return inspectDebPackage(filePath, fileName, stat.size, options.signal);
  }
  if (
    header[0] === 0x7f &&
    header[1] === 0x45 &&
    header[2] === 0x4c &&
    header[3] === 0x46 &&
    header[8] === 0x41 &&
    header[9] === 0x49
  ) {
    return inspectAppImage(filePath, fileName, stat.size, options.signal);
  }

  const extension = extname(fileName).toLowerCase();
  if (stat.size <= 1024 * 1024) {
    const content = await readFile(filePath, "utf8");
    options.signal?.throwIfAborted();
    if (looksLikeFlatpakRef(content)) {
      return inspectFlatpakRef(
        filePath,
        fileName,
        stat.size,
        options.flatpakScope,
        options.signal,
      );
    }
  }

  if (extension === ".flatpak") {
    return inspectFlatpakBundle(
      filePath,
      fileName,
      stat.size,
      options.flatpakScope,
      options.signal,
    );
  }

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

export async function installLocalPackage(
  pkg: LocalPackage,
  options: LocalPackageInstallOptions,
): Promise<LocalInstallOutcome> {
  await assertSelectedFileUnchanged(pkg);
  switch (pkg.kind) {
    case "deb":
      return installDebPackage(pkg, options);
    case "flatpak-bundle":
    case "flatpakref":
      options.onProgress?.({
        message: "Installing with Flatpak",
        cancellable: false,
      });
      return installFlatpakFile(pkg);
    case "appimage":
      options.onProgress?.({
        message: "Integrating AppImage",
        cancellable: false,
      });
      return integrateAppImage(pkg, {
        supportPath: options.appImageSupportPath,
        applicationsDirectory: options.applicationsDirectory,
        desktopEntriesDirectory: options.desktopEntriesDirectory,
      });
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

async function assertSelectedFileUnchanged(pkg: LocalPackage): Promise<void> {
  let stat;
  try {
    stat = await lstat(pkg.filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new LocalPackageError("invalid", "The selected file no longer exists");
    }
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== pkg.fileSize) {
    throw new LocalPackageError(
      "invalid",
      "The selected file changed after it was inspected; inspect it again before installing",
    );
  }
}

function scopeLabel(scope: FlatpakScope): string {
  return scope === "user" ? "User" : "System";
}

export * from "./types.ts";
