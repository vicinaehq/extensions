import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DepotOperationError } from "./errors.ts";
import { userDataDirectory } from "./linux.ts";
import {
  inspectAppImageMetadata,
  readAndValidateAppImageHeader,
  refreshDesktopDatabase,
  type AppImageMetadata,
} from "./local-packages/appimage.ts";
import { packageNameFromFile } from "./local-packages/parsing.ts";
import type { ManagedAppImageRecord } from "./local-packages/types.ts";
import {
  launchDetachedProcess,
  requireExecutable,
} from "./utils/process.ts";

const RECORD_SIZE_LIMIT = 64 * 1024;
const DISCOVERY_BATCH_SIZE = 8;

type AppImageManagementErrorKind = "unavailable" | "invalid" | "failed";

export class AppImageManagementError
  extends DepotOperationError<AppImageManagementErrorKind> {
  constructor(
    kind: AppImageManagementErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super("AppImageManagementError", kind, message, technicalDetails);
  }
}

export interface InstalledAppImage {
  name: string;
  description: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  appImageType: 1 | 2;
  architecture?: string;
  version?: string;
  iconPath?: string;
  managedByDepot: boolean;
  device: number;
  inode: number;
  modifiedAt: number;
}

export interface AppImageLocations {
  supportPath: string;
  applicationsDirectory?: string;
  desktopEntriesDirectory?: string;
}

export interface RemoveInstalledAppImageOptions extends AppImageLocations {
  moveToTrash(paths: readonly string[]): Promise<void>;
  refreshDesktopDatabase?: boolean;
}

interface ManagedRecord {
  record: ManagedAppImageRecord;
  recordPath: string;
}

export async function listInstalledAppImages(
  options: AppImageLocations,
  signal?: AbortSignal,
): Promise<InstalledAppImage[]> {
  const applicationsDirectory = appImageDirectory(options);
  const entries = await listApplicationFiles(applicationsDirectory);
  const managedRecords = await loadManagedRecords(options);
  const appImages: InstalledAppImage[] = [];

  for (let index = 0; index < entries.length; index += DISCOVERY_BATCH_SIZE) {
    signal?.throwIfAborted();
    const batch = entries.slice(index, index + DISCOVERY_BATCH_SIZE);
    const inspected = await Promise.all(
      batch.map((fileName) => inspectDiscoveredAppImage(
        join(applicationsDirectory, fileName),
        managedRecords,
        signal,
      )),
    );
    appImages.push(...inspected.filter(
      (item): item is InstalledAppImage => Boolean(item),
    ));
  }

  signal?.throwIfAborted();
  return appImages.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
      numeric: true,
    }) || left.filePath.localeCompare(right.filePath)
  );
}

export async function loadInstalledAppImageDetails(
  appImage: InstalledAppImage,
  options: AppImageLocations,
  signal?: AbortSignal,
): Promise<AppImageMetadata> {
  await assertCurrentAppImage(appImage, appImageDirectory(options));
  return inspectAppImageMetadata(appImage.filePath, signal);
}

export async function launchInstalledAppImage(
  appImage: InstalledAppImage,
  options: AppImageLocations,
): Promise<void> {
  await assertCurrentAppImage(appImage, appImageDirectory(options));
  try {
    await requireExecutable(appImage.filePath);
  } catch (error) {
    throw new AppImageManagementError(
      "unavailable",
      "This AppImage is not executable",
      error instanceof Error ? error.message : undefined,
    );
  }

  try {
    await launchDetachedProcess(appImage.filePath);
  } catch (error) {
    throw new AppImageManagementError(
      "failed",
      `Could not launch ${appImage.name}`,
      error instanceof Error ? error.message : undefined,
    );
  }
}

export async function removeInstalledAppImage(
  appImage: InstalledAppImage,
  options: RemoveInstalledAppImageOptions,
): Promise<readonly string[]> {
  const applicationsDirectory = appImageDirectory(options);
  await assertCurrentAppImage(appImage, applicationsDirectory);

  const paths = [appImage.filePath];
  if (appImage.managedByDepot) {
    const managed = (await loadManagedRecords(options)).get(appImage.filePath);
    if (!managed) {
      throw new AppImageManagementError(
        "invalid",
        "Depot ownership information changed; refresh before removing this AppImage",
      );
    }
    paths.push(
      managed.record.desktopEntryPath,
      ...(managed.record.iconPath ? [managed.record.iconPath] : []),
      managed.recordPath,
    );
  }

  const existingPaths: string[] = [];
  for (const path of paths) {
    if (await assertRemovableRegularFile(path, path === appImage.filePath)) {
      existingPaths.push(path);
    }
  }

  try {
    await options.moveToTrash(existingPaths);
  } catch (error) {
    throw new AppImageManagementError(
      "failed",
      "The AppImage could not be moved to Trash",
      error instanceof Error ? error.message : undefined,
    );
  }

  if (appImage.managedByDepot && options.refreshDesktopDatabase !== false) {
    await refreshDesktopDatabase(desktopEntriesDirectory(options));
  }
  return existingPaths;
}

/**
 * Finds an existing Depot integration of the same application: an identical
 * file by content hash first, then (for older records) the same name.
 */
export async function findManagedAppImage(
  options: AppImageLocations,
  match: { contentHash: string; name: string },
): Promise<ManagedAppImageRecord | undefined> {
  const records = [...(await loadManagedRecords(options)).values()]
    .map((managed) => managed.record);
  const name = match.name.toLocaleLowerCase();
  const candidates = [
    ...records.filter((record) => record.contentHash === match.contentHash),
    ...records.filter((record) => record.name.toLocaleLowerCase() === name),
  ];
  for (const record of candidates) {
    if (await isRegularFile(record.managedPath)) return record;
  }
  return undefined;
}

export function appImageKey(appImage: InstalledAppImage): string {
  return `appimage:${appImage.filePath}`;
}

export function appImageDirectory(options: AppImageLocations): string {
  return resolve(options.applicationsDirectory ?? join(homedir(), "Applications"));
}

async function listApplicationFiles(directory: string): Promise<string[]> {
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new AppImageManagementError(
        "invalid",
        "The AppImage directory is not a regular directory",
      );
    }
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    if (error instanceof AppImageManagementError) throw error;
    throw new AppImageManagementError(
      "unavailable",
      "The AppImage directory could not be read",
      error instanceof Error ? error.message : undefined,
    );
  }
}

async function inspectDiscoveredAppImage(
  filePath: string,
  managedRecords: ReadonlyMap<string, ManagedRecord>,
  signal?: AbortSignal,
): Promise<InstalledAppImage | undefined> {
  try {
    signal?.throwIfAborted();
    const stat = await lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) return undefined;
    const header = await readAndValidateAppImageHeader(filePath);
    const managed = managedRecords.get(filePath);
    const iconPath = managed?.record.iconPath &&
        await isRegularFile(managed.record.iconPath)
      ? managed.record.iconPath
      : undefined;
    return {
      name: managed?.record.name ?? packageNameFromFile(filePath),
      description: "Portable AppImage application",
      filePath,
      fileName: basename(filePath),
      fileSize: stat.size,
      appImageType: header.type,
      architecture: managed?.record.architecture ?? header.architecture,
      version: managed?.record.applicationVersion,
      iconPath,
      managedByDepot: Boolean(managed),
      device: stat.dev,
      inode: stat.ino,
      modifiedAt: stat.mtimeMs,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    return undefined;
  }
}

async function loadManagedRecords(
  options: AppImageLocations,
): Promise<Map<string, ManagedRecord>> {
  const records = new Map<string, ManagedRecord>();
  const recordsDirectory = join(options.supportPath, "appimages");
  let entries;
  try {
    const directoryStat = await lstat(recordsDirectory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      return records;
    }
    entries = await readdir(recordsDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return records;
    return records;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-f0-9]{20}\.json$/.test(entry.name)) continue;
    const recordPath = join(recordsDirectory, entry.name);
    try {
      const stat = await lstat(recordPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > RECORD_SIZE_LIMIT) {
        continue;
      }
      const value: unknown = JSON.parse(await readFile(recordPath, "utf8"));
      const record = validateManagedRecord(
        value,
        entry.name.slice(0, -5),
        options,
      );
      if (record && await managedRecordDirectoriesAreSafe(record, options)) {
        records.set(record.managedPath, { record, recordPath });
      }
    } catch {
      // Invalid or stale records never grant Depot ownership of a file.
    }
  }
  return records;
}

function validateManagedRecord(
  value: unknown,
  id: string,
  options: AppImageLocations,
): ManagedAppImageRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<ManagedAppImageRecord>;
  if (
    record.version !== 1 ||
    record.id !== id ||
    record.source !== "local-file" ||
    typeof record.name !== "string" ||
    typeof record.managedPath !== "string" ||
    typeof record.desktopEntryPath !== "string" ||
    typeof record.integratedAt !== "string" ||
    Number.isNaN(Date.parse(record.integratedAt)) ||
    (record.applicationVersion !== undefined &&
      typeof record.applicationVersion !== "string") ||
    (record.architecture !== undefined && typeof record.architecture !== "string") ||
    (record.iconPath !== undefined && typeof record.iconPath !== "string") ||
    (record.contentHash !== undefined &&
      !(typeof record.contentHash === "string" &&
        /^[a-f0-9]{64}$/.test(record.contentHash)))
  ) {
    return undefined;
  }

  const managedPath = resolve(record.managedPath);
  const applicationsDirectory = appImageDirectory(options);
  const expectedId = createHash("sha256")
    .update(managedPath)
    .digest("hex")
    .slice(0, 20);
  if (dirname(managedPath) !== applicationsDirectory || expectedId !== id) {
    return undefined;
  }

  const desktopPath = resolve(record.desktopEntryPath);
  if (
    desktopPath !== join(
      desktopEntriesDirectory(options),
      `depot-appimage-${id}.desktop`,
    )
  ) {
    return undefined;
  }

  let iconPath: string | undefined;
  if (record.iconPath) {
    iconPath = resolve(record.iconPath);
    if (
      dirname(iconPath) !== join(applicationsDirectory, ".icons") ||
      !basename(iconPath).startsWith(`depot-appimage-${id}.`)
    ) {
      return undefined;
    }
  }

  const name = cleanText(record.name, 160);
  if (!name) return undefined;

  return {
    version: 1,
    id,
    name,
    applicationVersion: cleanOptionalText(record.applicationVersion, 100),
    architecture: cleanOptionalText(record.architecture, 100),
    source: "local-file",
    contentHash: record.contentHash,
    managedPath,
    desktopEntryPath: desktopPath,
    iconPath,
    integratedAt: record.integratedAt,
  };
}

async function managedRecordDirectoriesAreSafe(
  record: ManagedAppImageRecord,
  options: AppImageLocations,
): Promise<boolean> {
  if (!(await isRegularDirectory(desktopEntriesDirectory(options)))) return false;
  if (record.iconPath) {
    return isRegularDirectory(join(appImageDirectory(options), ".icons"));
  }
  return true;
}

async function assertCurrentAppImage(
  appImage: InstalledAppImage,
  applicationsDirectory: string,
): Promise<void> {
  if (dirname(resolve(appImage.filePath)) !== applicationsDirectory) {
    throw new AppImageManagementError(
      "invalid",
      "The AppImage is outside the managed Applications directory",
    );
  }

  let stat;
  try {
    stat = await lstat(appImage.filePath);
  } catch (error) {
    throw new AppImageManagementError(
      "unavailable",
      "The AppImage is no longer available",
      error instanceof Error ? error.message : undefined,
    );
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.dev !== appImage.device ||
    stat.ino !== appImage.inode ||
    stat.size !== appImage.fileSize ||
    stat.mtimeMs !== appImage.modifiedAt
  ) {
    throw new AppImageManagementError(
      "invalid",
      "The AppImage changed; refresh before continuing",
    );
  }

  try {
    await readAndValidateAppImageHeader(appImage.filePath);
  } catch (error) {
    throw new AppImageManagementError(
      "invalid",
      "The file is no longer a valid AppImage",
      error instanceof Error ? error.message : undefined,
    );
  }
}

async function assertRemovableRegularFile(
  path: string,
  required: boolean,
): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new AppImageManagementError(
        "invalid",
        "AppImage removal stopped because a managed path changed",
        path,
      );
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !required) {
      return false;
    }
    if (error instanceof AppImageManagementError) throw error;
    throw new AppImageManagementError(
      "failed",
      "AppImage removal could not validate its target files",
      error instanceof Error ? error.message : undefined,
    );
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function isRegularDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function desktopEntriesDirectory(options: AppImageLocations): string {
  return resolve(
    options.desktopEntriesDirectory ?? join(userDataDirectory(), "applications"),
  );
}

function cleanOptionalText(
  value: string | undefined,
  limit: number,
): string | undefined {
  return value === undefined ? undefined : cleanText(value, limit) || undefined;
}

function cleanText(value: string, limit: number): string {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, limit);
}
