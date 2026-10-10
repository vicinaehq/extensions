import { basename, extname } from "node:path";
import { isValidAptPackageId } from "../backends/apt-parsing.ts";
import { isValidFlatpakAppId } from "../backends/flatpak-parsing.ts";

export interface DebianControlFields {
  packageId: string;
  version: string;
  architecture: string;
  description: string;
  homepage?: string;
}

export interface ParsedFlatpakRef {
  appId: string;
  name: string;
  branch?: string;
  remoteUrl: string;
  runtimeRepository?: string;
}

export interface ParsedFlatpakBundle {
  appId: string;
  branch?: string;
  architecture?: string;
  runtime?: string;
  downloadSize?: string;
  installedSize?: string;
}

export interface ParsedAppImageDesktopEntry {
  name: string;
  description: string;
  version?: string;
  homepage?: string;
  iconName?: string;
}

export interface AppImageHeader {
  type: 1 | 2;
  architecture?: string;
  squashfsOffset?: number;
}

export function parseDebianControl(content: string): DebianControlFields | undefined {
  const fields = parseRfc822Fields(content);
  const packageId = fields.get("Package")?.trim();
  const version = fields.get("Version")?.trim();
  const architecture = fields.get("Architecture")?.trim();
  if (
    !packageId ||
    !isValidAptPackageId(packageId) ||
    !version ||
    !architecture ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(architecture)
  ) {
    return undefined;
  }

  return {
    packageId,
    version,
    architecture,
    description: normalizeDebianDescription(fields.get("Description")),
    homepage: safeHttpUrl(fields.get("Homepage")),
  };
}

export function parseInstalledDebOutput(
  output: string,
): { version: string } | undefined {
  const [status, version] = output.trim().split("\t");
  return status?.trim() === "ii" && version ? { version } : undefined;
}

export function parseFlatpakRef(content: string): ParsedFlatpakRef | undefined {
  const fields = parseIniGroup(content, "Flatpak Ref");
  if (!fields) return undefined;

  const version = fields.get("Version")?.trim();
  const appId = fields.get("Name")?.trim();
  const remoteUrl = safeRepositoryUrl(fields.get("Url"));
  if (
    version !== "1" ||
    !appId ||
    !isValidFlatpakAppId(appId) ||
    !remoteUrl ||
    fields.get("IsRuntime")?.trim().toLowerCase() === "true"
  ) {
    return undefined;
  }

  const title = sanitizeMetadataText(fields.get("Title"), 160);
  return {
    appId,
    name: title ?? appId,
    branch: sanitizeToken(fields.get("Branch")),
    remoteUrl,
    runtimeRepository: safeRepositoryUrl(fields.get("RuntimeRepo")),
  };
}

export function looksLikeFlatpakRef(content: string): boolean {
  return /^\s*\[Flatpak Ref]\s*$/m.test(content);
}

export function parseFlatpakBundle(
  branchesOutput: string,
  metadataOutput: string,
): ParsedFlatpakBundle | undefined {
  const branchLine = branchesOutput.split(/\r?\n/).find((line) =>
    line.trim().startsWith("app/")
  );
  if (!branchLine) return undefined;

  const [ref, installedSize, downloadSize] = branchLine.trim().split(/\t+/);
  const parts = ref?.split("/");
  if (
    !parts ||
    parts.length < 4 ||
    parts[0] !== "app" ||
    !parts[1] ||
    !isValidFlatpakAppId(parts[1])
  ) {
    return undefined;
  }

  const fields = parseIniGroup(metadataOutput, "Application");
  const metadataName = fields?.get("name")?.trim();
  if (metadataName && metadataName !== parts[1]) return undefined;

  return {
    appId: parts[1],
    architecture: sanitizeToken(parts[2]),
    branch: sanitizeToken(parts.slice(3).join("/")),
    runtime: sanitizeMetadataText(fields?.get("runtime"), 200),
    installedSize: sanitizeMetadataText(installedSize, 80),
    downloadSize: sanitizeMetadataText(downloadSize, 80),
  };
}

export function parseAppImageDesktopEntry(
  content: string,
): ParsedAppImageDesktopEntry | undefined {
  const fields = parseIniGroup(content, "Desktop Entry");
  if (!fields || fields.get("Type")?.trim() !== "Application") return undefined;

  const name = sanitizeMetadataText(fields.get("Name"), 160);
  if (!name) return undefined;

  return {
    name,
    description: sanitizeMetadataText(
      fields.get("Comment") ?? fields.get("GenericName"),
      500,
    ) ?? "Portable AppImage application",
    version: sanitizeMetadataText(fields.get("X-AppImage-Version"), 100),
    homepage: safeHttpUrl(fields.get("X-AppImage-Homepage")),
    iconName: sanitizeIconName(fields.get("Icon")),
  };
}

export function parseAppImageHeader(header: Buffer): AppImageHeader | undefined {
  if (
    header.length < 64 ||
    header[0] !== 0x7f ||
    header[1] !== 0x45 ||
    header[2] !== 0x4c ||
    header[3] !== 0x46 ||
    header[8] !== 0x41 ||
    header[9] !== 0x49 ||
    (header[10] !== 1 && header[10] !== 2)
  ) {
    return undefined;
  }

  const elfClass = header[4];
  const byteOrder = header[5];
  if ((elfClass !== 1 && elfClass !== 2) || (byteOrder !== 1 && byteOrder !== 2)) {
    return undefined;
  }

  const littleEndian = byteOrder === 1;
  const readUInt16 = (offset: number) => littleEndian
    ? header.readUInt16LE(offset)
    : header.readUInt16BE(offset);
  const machine = readUInt16(18);
  const result: AppImageHeader = {
    type: header[10] as 1 | 2,
    architecture: elfArchitecture(machine),
  };

  if (result.type === 2) {
    const sectionOffset = elfClass === 2
      ? readSafeUInt64(header, 40, littleEndian)
      : readUInt32(header, 32, littleEndian);
    const sectionEntrySize = readUInt16(elfClass === 2 ? 58 : 46);
    const sectionCount = readUInt16(elfClass === 2 ? 60 : 48);
    const squashfsOffset = sectionOffset + sectionEntrySize * sectionCount;
    if (!Number.isSafeInteger(squashfsOffset) || squashfsOffset <= 0) {
      return undefined;
    }
    result.squashfsOffset = squashfsOffset;
  }

  return result;
}

export function isDebianArchiveHeader(header: Buffer): boolean {
  return header.subarray(0, 8).equals(Buffer.from("!<arch>\n", "ascii"));
}

export function packageNameFromFile(filePath: string): string {
  const extension = extname(filePath);
  const stem = basename(filePath, extension)
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitizeMetadataText(stem, 160) ?? "Local Application";
}

export function sanitizeManagedFileStem(value: string): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
    .replace(/[^\p{L}\p{N} ._+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-. ]+|[-. ]+$/g, "")
    .slice(0, 100)
    .trim();
  return sanitized || "Application";
}

export function escapeDesktopValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

export function escapeDesktopExecArgument(value: string): string {
  const sanitized = value.replace(/[\r\n]/g, "");
  return `"${sanitized.replace(/[\\"`$]/g, "\\$&")}"`;
}

export function buildManagedDesktopEntry(input: {
  name: string;
  description: string;
  executablePath: string;
  iconPath?: string;
}): string {
  const lines = [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    `Name=${escapeDesktopValue(input.name)}`,
    `Comment=${escapeDesktopValue(input.description)}`,
    `Exec=${escapeDesktopExecArgument(input.executablePath)}`,
    input.iconPath ? `Icon=${escapeDesktopValue(input.iconPath)}` : undefined,
    "Terminal=false",
    "Categories=Utility;",
    "X-Depot-Managed=true",
    "",
  ];
  return lines.filter((line): line is string => line !== undefined).join("\n");
}

function parseRfc822Fields(content: string): Map<string, string> {
  const fields = new Map<string, string>();
  let currentKey: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && currentKey) {
      const continuation = line.trim() === "." ? "" : line.trim();
      fields.set(currentKey, `${fields.get(currentKey) ?? ""}\n${continuation}`);
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) {
      currentKey = undefined;
      continue;
    }
    currentKey = line.slice(0, separator).trim();
    fields.set(currentKey, line.slice(separator + 1).trim());
  }
  return fields;
}

function parseIniGroup(content: string, requestedGroup: string): Map<string, string> | undefined {
  let inRequestedGroup = false;
  let foundGroup = false;
  const fields = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const group = /^\[([^\]]+)]$/.exec(line)?.[1];
    if (group) {
      inRequestedGroup = group === requestedGroup;
      foundGroup ||= inRequestedGroup;
      continue;
    }
    if (!inRequestedGroup) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key || key.includes("[")) continue;
    fields.set(key, line.slice(separator + 1).trim());
  }
  return foundGroup ? fields : undefined;
}

function normalizeDebianDescription(value?: string): string {
  if (!value) return "Local Debian package";
  const paragraphs = value.split("\n");
  return paragraphs.map((line) => line.trim()).join("\n").trim() ||
    "Local Debian package";
}

function sanitizeMetadataText(value: string | undefined, limit: number): string | undefined {
  const sanitized = value
    ?.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
  return sanitized || undefined;
}

function sanitizeToken(value?: string): string | undefined {
  const token = value?.trim();
  return token && /^[A-Za-z0-9._+/-]+$/.test(token) ? token : undefined;
}

function sanitizeIconName(value?: string): string | undefined {
  const icon = value?.trim();
  return icon && /^[A-Za-z0-9._+-]+$/.test(icon) ? icon : undefined;
}

function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function safeRepositoryUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return ["https:", "http:", "file:"].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function readUInt32(header: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? header.readUInt32LE(offset) : header.readUInt32BE(offset);
}

function readSafeUInt64(header: Buffer, offset: number, littleEndian: boolean): number {
  const value = littleEndian ? header.readBigUInt64LE(offset) : header.readBigUInt64BE(offset);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.NaN;
}

function elfArchitecture(machine: number): string | undefined {
  return new Map<number, string>([
    [3, "i386"],
    [40, "arm"],
    [62, "x86_64"],
    [183, "aarch64"],
    [243, "riscv64"],
  ]).get(machine);
}
