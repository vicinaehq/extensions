export type SoftwareSource = "apt" | "flatpak";
export type FlatpakScope = "user" | "system";

export interface SoftwarePreferences {
  aptEnabled?: boolean;
  flatpakEnabled?: boolean;
  flatpakScope?: FlatpakScope;
}

export interface FlatpakPackageMetadata {
  remote: string;
  scope: FlatpakScope;
  branch?: string;
}

export interface SoftwarePackage {
  id: string;
  name: string;
  description: string;
  source: SoftwareSource;
  installed: boolean;
  version?: string;
  homepage?: string;
  longDescription?: string;
  flatpak?: FlatpakPackageMetadata;
}

export interface SoftwareUpdate extends SoftwarePackage {
  currentVersion?: string;
  availableVersion?: string;
  repository?: string;
  architecture?: string;
  downloadSize?: string;
}

export interface PackageBackend {
  readonly source: SoftwareSource;
  search(query: string, signal?: AbortSignal): Promise<SoftwarePackage[]>;
  isInstalled(id: string, signal?: AbortSignal): Promise<boolean>;
  install(pkg: SoftwarePackage): Promise<"installed" | "already-installed">;
  listInstalled(signal?: AbortSignal): Promise<SoftwarePackage[]>;
  remove(pkg: SoftwarePackage): Promise<"removed" | "not-installed">;
  listUpdates(signal?: AbortSignal): Promise<SoftwareUpdate[]>;
  update(pkg: SoftwareUpdate): Promise<void>;
  updateAll(): Promise<void>;
  refreshMetadata(): Promise<void>;
}
