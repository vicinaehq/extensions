import type { FlatpakScope } from "../types";

export type LocalPackageKind =
  | "deb"
  | "flatpak-bundle"
  | "flatpakref"
  | "appimage";

interface LocalPackageBase {
  kind: LocalPackageKind;
  filePath: string;
  fileName: string;
  fileSize: number;
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

export class LocalPackageError extends Error {
  readonly kind: LocalPackageErrorKind;
  readonly technicalDetails?: string;

  constructor(
    kind: LocalPackageErrorKind,
    message: string,
    technicalDetails?: string,
  ) {
    super(message);
    this.name = "LocalPackageError";
    this.kind = kind;
    this.technicalDetails = technicalDetails;
  }
}
