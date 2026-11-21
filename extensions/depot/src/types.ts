export type SoftwareSource = "apt" | "flatpak";
export type FlatpakScope = "user" | "system";
export type PreferredSource = "all" | SoftwareSource;

export interface DepotPreferences {
  aptEnabled?: boolean;
  flatpakEnabled?: boolean;
  flatpakScope?: FlatpakScope;
  preferredSource?: PreferredSource;
}

export interface FlatpakPackageMetadata {
  remote: string;
  scope: FlatpakScope;
  branch?: string;
}

export interface AppStreamPackageMetadata {
  componentId: string;
  kind: string;
  isGuiApplication: boolean;
  categories?: string[];
  license?: string;
}

export interface DesktopEntryMetadata {
  id: string;
  filePath: string;
}

export interface SoftwareItem {
  id: string;
  name: string;
  description: string;
  source: SoftwareSource;
  installed: boolean;
  version?: string;
  homepage?: string;
  longDescription?: string;
  icon?: string;
  appstream?: AppStreamPackageMetadata;
  flatpak?: FlatpakPackageMetadata;
  desktopEntry?: DesktopEntryMetadata;
  installationPath?: string;
}

export interface SoftwareUpdate extends SoftwareItem {
  currentVersion?: string;
  availableVersion?: string;
  repository?: string;
  architecture?: string;
  downloadSize?: string;
}

export interface SoftwareOperationStatus {
  message: string;
  cancellable: boolean;
}

export interface SoftwareOperationOptions {
  signal?: AbortSignal;
  onStatus?: (status: SoftwareOperationStatus) => void;
}
