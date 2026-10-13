export interface App {
  id: string;
  name: string;
  path?: string;
}

export interface ExportedSettings {
  defaultApp: App | null;
  ignorePatterns: string[];
  includeNested: boolean;
  onboardingCompleted: boolean;
  pinnedProjects: string[];
  projectTags: Record<string, string[]>;
  recentProjects: RecentProject[];
  recentProjectsCount: number;
  requireMarkers: boolean;
  scanDepth: number;
  showGitStatus: boolean;
  showRecentProjects: boolean;
  showStashCount: boolean;
  tags: Tag[];
  terminalApp: App | null;
  usage?: UsageStore;
  workspaceApps: Record<string, App>;
  workspaces: string[];
}

export interface Tag {
  color: string;
  id: string;
  name: string;
}


export interface ProjectUsage {
  days: Record<string, number>;
  lastOpened: number;
  total: number;
}

export interface UsageStore {
  installedAt: number;
  projects: Record<string, ProjectUsage>;
}

export interface GitCommit {
  author: string;
  hash: string;
  message: string;
  relativeTime: string;
}

export interface GitStatus {
  branch: string;
  /** Total dirty files (modified + untracked). */
  dirty: number;
  modified: number;
  pull: number;
  push: number;
  stash: number;
  untracked: number;
  updatedAt: number;
}

export interface Project {
  fullPath: string;
  gitStatus?: GitStatus | null;
  /** Absolute path to `.workspace/icon.*` when present. */
  iconPath?: string;
  isGitRepo?: boolean;
  markers?: string[];
  name: string;
  parentFolder: string;
}

export interface RecentProject {
  lastOpened: number;
  path: string;
}

export interface SettingsBackup {
  exportedAt: string;
  settings: ExportedSettings;
  version: 1 | 2 | 3 | 4;
}

export type GitResult = { ok: true } | { message: string; ok: false };
