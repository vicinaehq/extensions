import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  rmdir,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import type { FlatpakScope, SoftwareOperationOptions } from "../types.ts";
import {
  findManagedAppImage,
  type AppImageLocations,
} from "../appimages.ts";
import { inspectAppImage, integrateAppImage } from "./appimage.ts";
import {
  debDowngradeMessage,
  inspectDebPackage,
  installDebPackage,
  type DebTools,
} from "./deb.ts";
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
  type LocalPackageAction,
} from "./types.ts";

const STAGING_PREFIX = "depot-install-";
const STALE_STAGING_MS = 24 * 60 * 60 * 1000;

export interface LocalPackageInspectionOptions {
  flatpakScope: FlatpakScope;
  signal?: AbortSignal;
  /** Enables detection of an existing Depot-managed AppImage integration. */
  appImageLocations?: AppImageLocations;
}

export interface LocalPackageInstallOptions extends SoftwareOperationOptions {
  supportPath: string;
  applicationsDirectory?: string;
  desktopEntriesDirectory?: string;
  /** Parent of per-install staging directories; defaults to os.tmpdir(). */
  stagingParent?: string;
  /** Test seams; production uses fixed /usr/bin tools. */
  debTools?: DebTools;
  flatpakExecutable?: string;
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
    if (options.appImageLocations) {
      const existing = await findManagedAppImage(options.appImageLocations, pkg);
      if (existing) {
        pkg.installed = true;
        pkg.installedVersion = existing.applicationVersion;
        pkg.integratedPath = existing.managedPath;
        // An identical file adds nothing; a same-name match from an older
        // record or another build may still be integrated as another copy.
        if (existing.contentHash === pkg.contentHash) pkg.action = "current";
      }
    }
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
  const blocked = localPackageBlockedReason(pkg);
  if (blocked) throw new LocalPackageError("invalid", blocked);

  const stagingParent = options.stagingParent ?? tmpdir();
  await removeStaleStagingDirectories(stagingParent);
  const staged = await stageReviewedPackage(pkg, stagingParent, options.signal);
  const stagedPackage: LocalPackage = { ...pkg, filePath: staged.filePath };
  try {
    switch (stagedPackage.kind) {
      case "deb":
        return await installDebPackage(stagedPackage, options, options.debTools);
      case "flatpak-bundle":
      case "flatpakref":
        options.onStatus?.({
          message: `${localPackageActionWords(pkg).progress} with Flatpak`,
          cancellable: false,
        });
        return await installFlatpakFile(stagedPackage, {
          executable: options.flatpakExecutable,
        });
      case "appimage":
        options.onStatus?.({
          message: "Integrating AppImage",
          cancellable: false,
        });
        return await integrateAppImage(stagedPackage, {
          supportPath: options.supportPath,
          applicationsDirectory: options.applicationsDirectory,
          desktopEntriesDirectory: options.desktopEntriesDirectory,
        });
    }
  } finally {
    await removeStagedPackage(staged.directory, staged.filePath);
  }
}

const ACTION_WORDS: Record<
  LocalPackageAction,
  { title: string; progress: string; done: string }
> = {
  install: { title: "Install", progress: "Installing", done: "installed" },
  update: { title: "Update", progress: "Updating", done: "updated" },
  upgrade: { title: "Upgrade", progress: "Upgrading", done: "upgraded" },
  downgrade: { title: "Downgrade", progress: "Downgrading", done: "downgraded" },
  current: { title: "Already Installed", progress: "Checking", done: "already installed" },
  integrate: { title: "Integrate", progress: "Integrating", done: "integrated" },
};

/** Consistent wording for the action title, confirmation, toast, and history. */
export function localPackageActionWords(
  pkg: LocalPackage,
): { title: string; progress: string; done: string } {
  return ACTION_WORDS[pkg.action];
}

export function localPackageActionLabel(pkg: LocalPackage): string {
  if (pkg.kind === "appimage") {
    return pkg.integratedPath ? "Integrate Another Copy" : "Integrate AppImage";
  }
  return ACTION_WORDS[pkg.action].title;
}

/** Explains why the reviewed file cannot be applied, before any authentication. */
export function localPackageBlockedReason(pkg: LocalPackage): string | undefined {
  if (pkg.action === "current") {
    switch (pkg.kind) {
      case "deb":
        return `${pkg.name} ${pkg.installedVersion ?? ""} is already installed`
          .replace(/\s+/g, " ");
      case "appimage":
        return `This AppImage is already integrated at ${pkg.integratedPath ?? "~/Applications"}`;
      default:
        return `This build of ${pkg.name} is already installed for the ${pkg.scope} scope`;
    }
  }
  if (pkg.action === "downgrade" && pkg.kind === "deb") {
    return debDowngradeMessage(pkg);
  }
  return undefined;
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

const STAGED_FILE_NAMES: Record<LocalPackage["kind"], string> = {
  // APT treats only arguments ending in .deb as local archives.
  deb: "package.deb",
  "flatpak-bundle": "package.flatpak",
  flatpakref: "package.flatpakref",
  appimage: "package.AppImage",
};

async function stageReviewedPackage(
  pkg: LocalPackage,
  parent: string,
  signal?: AbortSignal,
): Promise<{ directory: string; filePath: string }> {
  // Each install gets a fresh private mkdtemp directory, so no other user can
  // pre-create or replace it. APT hands local archives to its unprivileged
  // _apt helper, so .deb directories are traversable (not listable) and the
  // archive world-readable; everything else stays owner-only. The read-only
  // copy ensures the installed bytes are the bytes Depot reviewed.
  const directory = await mkdtemp(join(parent, STAGING_PREFIX));
  const aptReadable = pkg.kind === "deb";
  const filePath = join(directory, STAGED_FILE_NAMES[pkg.kind]);
  try {
    await chmod(directory, aptReadable ? 0o711 : 0o700);
    signal?.throwIfAborted();
    const contentHash = await copyAndHashFile(
      pkg.filePath,
      filePath,
      aptReadable ? 0o444 : 0o400,
      signal,
    );
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

/**
 * Best-effort cleanup of staging directories left by an interrupted install.
 * Only this user's real directories older than a day are touched, and only
 * their direct non-directory entries are unlinked before rmdir.
 */
async function removeStaleStagingDirectories(parent: string): Promise<void> {
  const uid = process.getuid?.();
  if (uid === undefined) return;
  const cutoff = Date.now() - STALE_STAGING_MS;
  try {
    for (const name of await readdir(parent)) {
      if (!name.startsWith(STAGING_PREFIX)) continue;
      const directory = join(parent, name);
      try {
        const stat = await lstat(directory);
        if (
          !stat.isDirectory() ||
          stat.uid !== uid ||
          stat.mtimeMs > cutoff
        ) {
          continue;
        }
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (!entry.isDirectory()) await unlink(join(directory, entry.name));
        }
        await rmdir(directory);
      } catch {
        // Leave anything unexpected in place.
      }
    }
  } catch {
    // Staging cleanup must never block a new install.
  }
}

async function copyAndHashFile(
  sourcePath: string,
  destinationPath: string,
  finalMode: number,
  signal?: AbortSignal,
): Promise<string> {
  let source;
  try {
    // A source swapped for a symbolic link after review is refused outright.
    source = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ELOOP" || code === "ENOENT") {
      throw new LocalPackageError(
        "invalid",
        "The selected file changed after it was inspected; inspect it again before installing",
      );
    }
    throw error;
  }
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
    await destination.chmod(finalMode);
    return hash.digest("hex");
  } finally {
    await Promise.all([source.close(), destination?.close()]);
  }
}

async function removeStagedPackage(
  directory: string,
  filePath: string,
): Promise<void> {
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
