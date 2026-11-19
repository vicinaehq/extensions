import type { FlatpakScope } from "../types.ts";
import { DepotOperationError } from "../errors.ts";

export type LocalPackageKind =
  | "deb"
  | "flatpak-bundle"
  | "flatpakref"
  | "appimage";

/**
 * What confirming the review will do, computed at inspection time.
 * "current" means the same version is already installed and nothing is
 * offered; "downgrade" is reported but blocked before authentication.
 */
export type LocalPackageAction =
  | "install"
  | "update"
  | "upgrade"
  | "downgrade"
  | "current"
  | "integrate";

interface LocalPackageBase {
  kind: LocalPackageKind;
  action: LocalPackageAction;
  filePath: string;
  fileName: string;
  fileSize: number;
  contentHash: string;
  name: string;
  description: string;
  version?: string;
  architecture?: string;
  installed: boolean;
  installedVersion?: string;
  homepage?: string;
}

export interface LocalDebPackage extends LocalPackageBase {
  kind: "deb";
  packageId: string;
  version: string;
}

export interface LocalFlatpakBundle extends LocalPackageBase {
  kind: "flatpak-bundle";
  appId: string;
  branch?: string;
  runtime?: string;
  scope: FlatpakScope;
  downloadSize?: string;
  installedSize?: string;
}

export interface LocalFlatpakRef extends LocalPackageBase {
  kind: "flatpakref";
  appId: string;
  branch?: string;
  remoteUrl: string;
  runtimeRepository?: string;
  scope: FlatpakScope;
}

export interface EmbeddedAppImageIcon {
  data: Buffer;
  extension: ".png" | ".svg" | ".xpm";
  mimeType: "image/png" | "image/svg+xml" | "image/x-xpixmap";
}

export interface LocalAppImage extends LocalPackageBase {
  kind: "appimage";
  appImageType: 1 | 2;
  desktopFileName?: string;
  icon?: EmbeddedAppImageIcon;
  /** Depot-managed copy of the same application, when one already exists. */
  integratedPath?: string;
}

export type LocalPackage =
  | LocalDebPackage
  | LocalFlatpakBundle
  | LocalFlatpakRef
  | LocalAppImage;

export interface ManagedAppImageRecord {
  version: 1;
  id: string;
  name: string;
  applicationVersion?: string;
  architecture?: string;
  source: "local-file";
  /** SHA-256 of the integrated file; absent in records from older versions. */
  contentHash?: string;
  managedPath: string;
  desktopEntryPath: string;
  iconPath?: string;
  integratedAt: string;
}

export interface LocalInstallOutcome {
  status: "installed" | "already-installed" | "integrated";
  managedPath?: string;
}

export type LocalPackageErrorKind =
  | "unavailable"
  | "unsupported"
  | "invalid"
  | "cancelled"
  | "authentication"
  | "busy"
  | "failed";

export class LocalPackageError extends DepotOperationError<LocalPackageErrorKind> {
  constructor(
    kind: LocalPackageErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super("LocalPackageError", kind, message, technicalDetails);
  }
}
