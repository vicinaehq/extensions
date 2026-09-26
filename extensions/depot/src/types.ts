export type SoftwareSource = "apt" | "flatpak";
export type FlatpakScope = "user" | "system";

export interface DepotPreferences {
  aptEnabled?: boolean;
  flatpakEnabled?: boolean;
  flatpakScope?: FlatpakScope;
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
}

export interface SoftwareUpdate extends SoftwareItem {
  currentVersion?: string;
  availableVersion?: string;
  repository?: string;
  architecture?: string;
  downloadSize?: string;
}

export interface PackageBackend {
  readonly source: SoftwareSource;
  search(query: string, signal?: AbortSignal): Promise<SoftwareItem[]>;
  isInstalled(id: string, signal?: AbortSignal): Promise<boolean>;
  install(pkg: SoftwareItem): Promise<"installed" | "already-installed">;
  listInstalled(signal?: AbortSignal): Promise<SoftwareItem[]>;
  remove(pkg: SoftwareItem): Promise<"removed" | "not-installed">;
  listUpdates(signal?: AbortSignal): Promise<SoftwareUpdate[]>;
  update(pkg: SoftwareUpdate): Promise<void>;
  updateAll(): Promise<void>;
  refreshMetadata(): Promise<void>;
}
