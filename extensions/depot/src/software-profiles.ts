import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  open,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import type { InstalledAppImage } from "./appimages.ts";
import { isValidAptPackageId } from "./backends/apt-parsing.ts";
import { isValidFlatpakAppId } from "./backends/flatpak-parsing.ts";
import { DepotOperationError } from "./errors.ts";
import { recentActionSource } from "./recent-actions.ts";

const PROFILE_VERSION = 1;
const MAX_PROFILE_BYTES = 128 * 1024;
const MAX_PROFILE_ENTRIES = 500;
const TEXT_LIMIT = 200;
const KNOWN_PROFILE_FIELDS = new Set([
  "version",
  "apt",
  "flatpak",
  "appimage",
]);
const KNOWN_APPIMAGE_FIELDS = new Set([
  "name",
  "filename",
  "source",
  "version",
  "architecture",
]);

export type ProfileErrorKind = "invalid" | "unsupported" | "unavailable" | "failed";

export class ProfileError extends DepotOperationError<ProfileErrorKind> {
  constructor(
    kind: ProfileErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super("ProfileError", kind, message, technicalDetails);
  }
}

export interface ProfileAppImage {
  name: string;
  filename: string;
  source: "managed" | "external";
  version?: string;
  architecture?: string;
}

export interface SoftwareProfile {
  version: 1;
  apt: string[];
  flatpak: string[];
  appImages: ProfileAppImage[];
  filePath?: string;
}

export interface SoftwareProfileInput {
  apt?: readonly string[];
  flatpak?: readonly string[];
  appImages?: readonly ProfileAppImage[];
}

export function createSoftwareProfile(input: SoftwareProfileInput): SoftwareProfile {
  return parseSoftwareProfile(JSON.stringify({
    version: PROFILE_VERSION,
    apt: input.apt ?? [],
    flatpak: input.flatpak ?? [],
    appimage: input.appImages ?? [],
  }));
}

export function parseSoftwareProfile(
  contents: string,
  filePath?: string,
): SoftwareProfile {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new ProfileError(
      "invalid",
      "Profile is not valid JSON",
      error instanceof Error ? error.message : undefined,
    );
  }
  if (!isRecord(value)) {
    throw new ProfileError("invalid", "Profile must be a JSON object");
  }
  assertKnownFields(value, KNOWN_PROFILE_FIELDS, "profile");
  if (value.version !== PROFILE_VERSION) {
    throw new ProfileError(
      "unsupported",
      `Unsupported profile version: ${String(value.version)}`,
    );
  }

  const apt = parseIds(value.apt, "apt");
  const flatpak = parseIds(value.flatpak, "flatpak");
  const appImages = parseAppImages(value.appimage);
  const entryCount = apt.length + flatpak.length + appImages.length;
  if (entryCount === 0) {
    throw new ProfileError("invalid", "Profile must contain at least one entry");
  }
  if (entryCount > MAX_PROFILE_ENTRIES) {
    throw new ProfileError(
      "invalid",
      `Profile contains more than ${MAX_PROFILE_ENTRIES} entries`,
    );
  }
  return {
    version: PROFILE_VERSION,
    apt,
    flatpak,
    appImages,
    filePath: filePath ? resolve(filePath) : undefined,
  };
}

export function serializeSoftwareProfile(profile: SoftwareProfile): string {
  return `${JSON.stringify({
    version: PROFILE_VERSION,
    apt: profile.apt,
    flatpak: profile.flatpak,
    appimage: profile.appImages,
  }, null, 2)}\n`;
}

export async function readSoftwareProfile(filePath: string): Promise<SoftwareProfile> {
  const resolvedPath = resolve(filePath);
  let handle;
  try {
    handle = await open(resolvedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") {
      throw new ProfileError("invalid", "Profile must be a regular file");
    }
    throw new ProfileError(
      "unavailable",
      "Profile file is not available",
      error instanceof Error ? error.message : undefined,
    );
  }
  try {
    const file = await handle.stat();
    if (!file.isFile()) {
      throw new ProfileError("invalid", "Profile must be a regular file");
    }
    if (file.size <= 0 || file.size > MAX_PROFILE_BYTES) {
      throw new ProfileError(
        "invalid",
        `Profile must be between 1 byte and ${MAX_PROFILE_BYTES / 1024} KiB`,
      );
    }
    return parseSoftwareProfile(await handle.readFile("utf8"), resolvedPath);
  } finally {
    await handle.close();
  }
}

export async function writeSoftwareProfile(
  profile: SoftwareProfile,
  directory: string,
  fileName = "depot-software-profile.json",
): Promise<string> {
  const resolvedDirectory = resolve(directory);
  const directoryStat = await stat(resolvedDirectory).catch((error: unknown) => {
    throw new ProfileError(
      "unavailable",
      "Profile destination is not available",
      error instanceof Error ? error.message : undefined,
    );
  });
  if (!directoryStat.isDirectory()) {
    throw new ProfileError("invalid", "Profile destination must be a directory");
  }
  if (basename(fileName) !== fileName || extname(fileName).toLowerCase() !== ".json") {
    throw new ProfileError("invalid", "Profile filename must be a JSON filename");
  }

  const stem = fileName.slice(0, -5);
  const temporary = join(resolvedDirectory, `.depot-profile-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, serializeSoftwareProfile(profile), {
      flag: "wx",
      mode: 0o600,
    });
    for (let suffix = 1; suffix <= 100; suffix += 1) {
      const destination = join(
        resolvedDirectory,
        `${stem}${suffix === 1 ? "" : `-${suffix}`}.json`,
      );
      try {
        await link(temporary, destination);
        return destination;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
    }
    throw new ProfileError("failed", "A unique profile filename could not be created");
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    throw new ProfileError(
      "failed",
      "Software profile could not be saved",
      error instanceof Error ? error.message : undefined,
    );
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function defaultProfileDirectory(
  homeDirectory = homedir(),
): Promise<string> {
  const downloads = join(homeDirectory, "Downloads");
  const downloadsStat = await stat(downloads).catch(() => undefined);
  return downloadsStat?.isDirectory() ? downloads : homeDirectory;
}

export function profileAppImage(appImage: InstalledAppImage): ProfileAppImage {
  return {
    name: appImage.name,
    filename: appImage.fileName,
    source: appImage.managedByDepot ? "managed" : "external",
    ...(appImage.version ? { version: appImage.version } : {}),
    ...(appImage.architecture ? { architecture: appImage.architecture } : {}),
  };
}

function parseIds(value: unknown, source: "apt" | "flatpak"): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ProfileError("invalid", `${recentActionSource(source)} must be a list`);
  }
  const ids = value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new ProfileError(
        "invalid",
        `${recentActionSource(source)} entry ${index + 1} must be text`,
      );
    }
    const id = entry.trim();
    const valid = source === "apt"
      ? isValidAptPackageId(id)
      : isValidFlatpakAppId(id);
    if (!valid) {
      throw new ProfileError(
        "invalid",
        `${recentActionSource(source)} entry ${index + 1} has an invalid ID`,
      );
    }
    return id;
  });
  rejectDuplicates(ids, recentActionSource(source));
  return ids;
}

function parseAppImages(value: unknown): ProfileAppImage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ProfileError("invalid", "AppImage must be a list");
  }
  const entries = value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new ProfileError("invalid", `AppImage entry ${index + 1} must be an object`);
    }
    assertKnownFields(entry, KNOWN_APPIMAGE_FIELDS, `AppImage entry ${index + 1}`);
    const name = requiredText(entry.name, `AppImage entry ${index + 1} name`);
    const filename = requiredText(
      entry.filename,
      `AppImage entry ${index + 1} filename`,
    );
    if (basename(filename) !== filename || filename === "." || filename === "..") {
      throw new ProfileError(
        "invalid",
        `AppImage entry ${index + 1} has an invalid filename`,
      );
    }
    if (entry.source !== "managed" && entry.source !== "external") {
      throw new ProfileError(
        "invalid",
        `AppImage entry ${index + 1} has an invalid source`,
      );
    }
    return {
      name,
      filename,
      source: entry.source,
      version: optionalText(entry.version, `AppImage entry ${index + 1} version`),
      architecture: optionalText(
        entry.architecture,
        `AppImage entry ${index + 1} architecture`,
      ),
    } satisfies ProfileAppImage;
  });
  rejectDuplicates(entries.map((entry) => entry.filename), "AppImage filename");
  return entries;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new ProfileError("invalid", `${label} must be text`);
  }
  const text = value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
  if (!text) throw new ProfileError("invalid", `${label} cannot be empty`);
  if (text.length > TEXT_LIMIT) {
    throw new ProfileError("invalid", `${label} is too long`);
  }
  return text;
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, label);
}

function rejectDuplicates(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new ProfileError("invalid", `${label} is duplicated: ${value}`);
    }
    seen.add(value);
  }
}

function assertKnownFields(
  value: Record<string, unknown>,
  known: ReadonlySet<string>,
  label: string,
): void {
  const unknown = Object.keys(value).find((field) => !known.has(field));
  if (unknown) {
    throw new ProfileError("unsupported", `Unsupported ${label} field: ${unknown}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
