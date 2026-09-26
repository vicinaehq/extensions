import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { runProcess } from "../utils/process.ts";
import {
  buildManagedDesktopEntry,
  packageNameFromFile,
  parseAppImageDesktopEntry,
  parseAppImageHeader,
  sanitizeManagedFileStem,
  type AppImageHeader,
} from "./parsing.ts";
import {
  LocalPackageError,
  type EmbeddedAppImageIcon,
  type LocalAppImage,
  type LocalInstallOutcome,
  type ManagedAppImageRecord,
} from "./types.ts";

const UNSQUASHFS = "/usr/bin/unsquashfs";
const UPDATE_DESKTOP_DATABASE = "/usr/bin/update-desktop-database";
const COMMAND_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };
const MAX_ICON_BYTES = 2 * 1024 * 1024;

interface SquashfsEntry {
  path: string;
  type: "file" | "directory" | "symlink";
  target?: string;
}

export interface IntegrateAppImageOptions {
  applicationsDirectory?: string;
  desktopEntriesDirectory?: string;
  supportPath: string;
  refreshDesktopDatabase?: boolean;
}

export async function inspectAppImage(
  filePath: string,
  fileName: string,
  fileSize: number,
  signal?: AbortSignal,
): Promise<LocalAppImage> {
  const header = await readAndValidateAppImageHeader(filePath);
  signal?.throwIfAborted();

  let desktop: ReturnType<typeof parseAppImageDesktopEntry>;
  let desktopFileName: string | undefined;
  let icon: EmbeddedAppImageIcon | undefined;
  if (header.type === 2 && header.squashfsOffset !== undefined) {
    const metadata = await extractType2Metadata(
      filePath,
      header.squashfsOffset,
      signal,
    );
    desktop = metadata.desktop;
    desktopFileName = metadata.desktopFileName;
    icon = metadata.icon;
  }

  return {
    kind: "appimage",
    filePath,
    fileName,
    fileSize,
    appImageType: header.type,
    name: desktop?.name ?? packageNameFromFile(filePath),
    description: desktop?.description ?? "Portable AppImage application",
    version: desktop?.version,
    architecture: header.architecture,
    homepage: desktop?.homepage,
    installed: false,
    desktopFileName,
    icon,
  };
}

export async function readAndValidateAppImageHeader(
  filePath: string,
): Promise<AppImageHeader> {
  const handle = await open(filePath, "r");
  try {
    const fileStat = await handle.stat();
    const headerBytes = Buffer.alloc(128);
    const headerRead = await handle.read(headerBytes, 0, headerBytes.length, 0);
    const header = parseAppImageHeader(headerBytes.subarray(0, headerRead.bytesRead));
    if (!header) {
      throw new LocalPackageError(
        "invalid",
        "This file does not contain a valid AppImage header",
      );
    }

    if (header.type === 2 && header.squashfsOffset !== undefined) {
      const superblock = Buffer.alloc(96);
      const read = await handle.read(
        superblock,
        0,
        superblock.length,
        header.squashfsOffset,
      );
      const blockSize = read.bytesRead >= 16 ? superblock.readUInt32LE(12) : 0;
      const majorVersion = read.bytesRead >= 30 ? superblock.readUInt16LE(28) : 0;
      const bytesUsed = read.bytesRead >= 48
        ? superblock.readBigUInt64LE(40)
        : 0n;
      if (
        read.bytesRead !== superblock.length ||
        !superblock.subarray(0, 4).equals(Buffer.from("hsqs", "ascii")) ||
        majorVersion !== 4 ||
        blockSize < 4096 ||
        blockSize > 1024 * 1024 ||
        (blockSize & (blockSize - 1)) !== 0 ||
        bytesUsed < 96n ||
        BigInt(header.squashfsOffset) + bytesUsed > BigInt(fileStat.size)
      ) {
        throw new LocalPackageError(
          "invalid",
          "The AppImage does not contain a valid SquashFS payload",
        );
      }
    } else if (header.type === 1) {
      const isoDescriptor = Buffer.alloc(7);
      const read = await handle.read(isoDescriptor, 0, isoDescriptor.length, 32_768);
      if (
        read.bytesRead !== 7 ||
        isoDescriptor[0] !== 1 ||
        !isoDescriptor.subarray(1, 6).equals(Buffer.from("CD001", "ascii")) ||
        isoDescriptor[6] !== 1
      ) {
        throw new LocalPackageError(
          "invalid",
          "The AppImage does not contain a valid ISO payload",
        );
      }
    }

    return header;
  } finally {
    await handle.close();
  }
}

export async function integrateAppImage(
  pkg: LocalAppImage,
  options: IntegrateAppImageOptions,
): Promise<LocalInstallOutcome> {
  const sourceStat = await lstat(pkg.filePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new LocalPackageError("invalid", "The selected AppImage is not a regular file");
  }
  if (sourceStat.size !== pkg.fileSize) {
    throw new LocalPackageError(
      "invalid",
      "The selected AppImage changed after it was inspected",
    );
  }
  await readAndValidateAppImageHeader(pkg.filePath);

  const applicationsDirectory = options.applicationsDirectory ??
    join(homedir(), "Applications");
  const desktopEntriesDirectory = options.desktopEntriesDirectory ??
    join(homedir(), ".local", "share", "applications");
  const iconsDirectory = join(applicationsDirectory, ".icons");
  const recordsDirectory = join(options.supportPath, "appimages");
  await Promise.all([
    ensureManagedDirectory(applicationsDirectory),
    ensureManagedDirectory(desktopEntriesDirectory),
    ensureManagedDirectory(recordsDirectory),
  ]);
  if (pkg.icon) await ensureManagedDirectory(iconsDirectory);

  const stem = sanitizeManagedFileStem(pkg.name);
  const managedPath = await findAvailablePath(
    applicationsDirectory,
    stem,
    ".AppImage",
  );
  const managedId = createHash("sha256")
    .update(managedPath)
    .digest("hex")
    .slice(0, 20);
  const desktopEntryPath = join(
    desktopEntriesDirectory,
    `depot-appimage-${managedId}.desktop`,
  );
  const iconPath = pkg.icon
    ? join(iconsDirectory, `depot-appimage-${managedId}${pkg.icon.extension}`)
    : undefined;
  const recordPath = join(recordsDirectory, `${managedId}.json`);
  const created: string[] = [];
  let temporaryExecutable: string | undefined;

  try {
    temporaryExecutable = join(
      applicationsDirectory,
      `.depot-${randomUUID()}.tmp`,
    );
    await copyFile(pkg.filePath, temporaryExecutable, constants.COPYFILE_EXCL);
    await chmod(temporaryExecutable, (sourceStat.mode & 0o777) | 0o100);
    await link(temporaryExecutable, managedPath);
    created.push(managedPath);
    await unlink(temporaryExecutable);
    temporaryExecutable = undefined;

    if (pkg.icon && iconPath) {
      await createFileAtomically(iconPath, pkg.icon.data, 0o600);
      created.push(iconPath);
    }

    const desktopEntry = buildManagedDesktopEntry({
      name: pkg.name,
      description: pkg.description,
      executablePath: managedPath,
      iconPath,
    });
    await createFileAtomically(desktopEntryPath, desktopEntry, 0o600);
    created.push(desktopEntryPath);

    const record: ManagedAppImageRecord = {
      version: 1,
      id: managedId,
      name: pkg.name,
      applicationVersion: pkg.version,
      architecture: pkg.architecture,
      source: "local-file",
      managedPath,
      desktopEntryPath,
      iconPath,
      integratedAt: new Date().toISOString(),
    };
    await createFileAtomically(
      recordPath,
      `${JSON.stringify(record, null, 2)}\n`,
      0o600,
    );
    created.push(recordPath);
  } catch (error) {
    if (temporaryExecutable) await unlinkIfPresent(temporaryExecutable);
    await Promise.all(created.reverse().map(unlinkIfPresent));
    if (error instanceof LocalPackageError) throw error;
    throw new LocalPackageError(
      "failed",
      "AppImage integration failed and created files were cleaned up",
      error instanceof Error ? error.message : undefined,
    );
  }

  if (options.refreshDesktopDatabase !== false) {
    try {
      await access(UPDATE_DESKTOP_DATABASE, constants.X_OK);
      await runProcess(UPDATE_DESKTOP_DATABASE, [desktopEntriesDirectory], {
        allowNonZero: true,
        captureStdout: false,
        maxOutputBytes: 64 * 1024,
        timeoutMs: 10_000,
      });
    } catch {
      // Desktop database refresh is optional; the entry remains valid without it.
    }
  }

  return { status: "integrated", managedPath };
}

async function extractType2Metadata(
  filePath: string,
  offset: number,
  signal?: AbortSignal,
): Promise<{
  desktop?: ReturnType<typeof parseAppImageDesktopEntry>;
  desktopFileName?: string;
  icon?: EmbeddedAppImageIcon;
}> {
  try {
    await access(UNSQUASHFS, constants.X_OK);
  } catch {
    return {};
  }

  try {
    const listing = await runProcess(
      UNSQUASHFS,
      ["-ll", "-offset", String(offset), filePath, "*.desktop"],
      {
        signal,
        env: COMMAND_ENV,
        allowNonZero: true,
        maxOutputBytes: 256 * 1024,
        timeoutMs: 15_000,
      },
    );
    const desktopEntry = parseSquashfsListing(listing.stdout)
      .filter((entry) => entry.type !== "directory" && entry.path.endsWith(".desktop"))
      .sort((left, right) => pathDepth(left.path) - pathDepth(right.path))[0];
    if (!desktopEntry) return {};

    const desktopResult = await runProcess(
      UNSQUASHFS,
      ["-cat", "-offset", String(offset), filePath, desktopEntry.path],
      {
        signal,
        env: COMMAND_ENV,
        maxOutputBytes: 128 * 1024,
        timeoutMs: 10_000,
      },
    );
    const desktop = parseAppImageDesktopEntry(desktopResult.stdout);
    if (!desktop) return {};

    const icon = await extractEmbeddedPng(
      filePath,
      offset,
      desktop.iconName,
      signal,
    );
    return {
      desktop,
      desktopFileName: basename(desktopEntry.path),
      icon,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return {};
  }
}

async function extractEmbeddedPng(
  filePath: string,
  offset: number,
  iconName: string | undefined,
  signal?: AbortSignal,
): Promise<EmbeddedAppImageIcon | undefined> {
  const candidates = [
    ".DirIcon",
    iconName ? `${iconName}.png` : undefined,
    iconName ? `usr/share/pixmaps/${iconName}.png` : undefined,
    iconName ? `usr/share/icons/hicolor/512x512/apps/${iconName}.png` : undefined,
    iconName ? `usr/share/icons/hicolor/256x256/apps/${iconName}.png` : undefined,
  ].filter((value): value is string => Boolean(value));

  let internalPath: string | undefined;
  for (const candidate of candidates) {
    internalPath = await resolveSquashfsFile(filePath, offset, candidate, signal);
    if (internalPath) break;
  }
  if (!internalPath) return undefined;

  const extractionDirectory = await mkdtemp(join(tmpdir(), "depot-appimage-"));
  try {
    const extraction = await runProcess(
      UNSQUASHFS,
      [
        "-f",
        "-d",
        extractionDirectory,
        "-offset",
        String(offset),
        filePath,
        internalPath,
      ],
      {
        signal,
        env: COMMAND_ENV,
        allowNonZero: true,
        maxOutputBytes: 128 * 1024,
        timeoutMs: 15_000,
      },
    );
    if (extraction.exitCode !== 0) return undefined;
    const extractedPath = resolve(extractionDirectory, internalPath);
    if (!isContainedPath(extractionDirectory, extractedPath)) return undefined;
    const stat = await lstat(extractedPath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_ICON_BYTES) return undefined;
    const data = await readFile(extractedPath);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!data.subarray(0, pngMagic.length).equals(pngMagic)) return undefined;
    return { data, extension: ".png", mimeType: "image/png" };
  } finally {
    await rm(extractionDirectory, { recursive: true, force: true });
  }
}

async function resolveSquashfsFile(
  filePath: string,
  offset: number,
  initialPath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  let currentPath = normalizeInternalPath(initialPath);
  if (!currentPath) return undefined;
  for (let depth = 0; depth < 6; depth += 1) {
    const result = await runProcess(
      UNSQUASHFS,
      ["-ll", "-offset", String(offset), filePath, currentPath],
      {
        signal,
        env: COMMAND_ENV,
        allowNonZero: true,
        maxOutputBytes: 64 * 1024,
        timeoutMs: 10_000,
      },
    );
    const entry = parseSquashfsListing(result.stdout)
      .find((candidate) => candidate.path === currentPath);
    if (!entry) return undefined;
    if (entry.type === "file") return entry.path;
    if (entry.type !== "symlink" || !entry.target) return undefined;
    if (entry.target.startsWith("/")) return undefined;
    currentPath = normalizeInternalPath(posix.join(posix.dirname(currentPath), entry.target));
    if (!currentPath) return undefined;
  }
  return undefined;
}

export function parseSquashfsListing(output: string): SquashfsEntry[] {
  const entries: SquashfsEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    const rootIndex = line.indexOf("squashfs-root/");
    if (rootIndex < 0) continue;
    const mode = line.trimStart()[0];
    if (mode !== "-" && mode !== "d" && mode !== "l") continue;
    const pathAndTarget = line.slice(rootIndex + "squashfs-root/".length);
    const arrowIndex = pathAndTarget.indexOf(" -> ");
    const entryPath = normalizeInternalPath(
      arrowIndex >= 0 ? pathAndTarget.slice(0, arrowIndex) : pathAndTarget,
    );
    if (!entryPath) continue;
    entries.push({
      path: entryPath,
      type: mode === "-" ? "file" : mode === "d" ? "directory" : "symlink",
      target: arrowIndex >= 0
        ? pathAndTarget.slice(arrowIndex + 4).trim()
        : undefined,
    });
  }
  return entries;
}

async function ensureManagedDirectory(path: string): Promise<void> {
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new LocalPackageError(
        "failed",
        `Managed path is not a regular directory: ${path}`,
      );
    }
  } catch (error) {
    if (error instanceof LocalPackageError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
}

async function findAvailablePath(
  directory: string,
  stem: string,
  extension: string,
): Promise<string> {
  for (let index = 1; index <= 10_000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const candidate = join(directory, `${stem}${suffix}${extension}`);
    try {
      await access(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return candidate;
      throw error;
    }
  }
  throw new LocalPackageError("failed", "No available AppImage filename could be selected");
}

async function createFileAtomically(
  target: string,
  content: string | Buffer,
  mode: number,
): Promise<void> {
  const temporary = join(dirname(target), `.depot-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { flag: "wx", mode });
    await link(temporary, target);
  } finally {
    await unlinkIfPresent(temporary);
  }
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function normalizeInternalPath(value: string): string | undefined {
  const normalized = posix.normalize(value.trim()).replace(/^\.\//, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    return undefined;
  }
  return normalized;
}

function pathDepth(value: string): number {
  return value.split("/").length;
}

function isContainedPath(parent: string, child: string): boolean {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${posix.sep}`) &&
    !posix.isAbsolute(relativePath);
}
