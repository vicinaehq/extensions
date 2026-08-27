export interface App {
  id: string;
  name: string;
  path?: string;
}

export interface ExportedSettings {
  defaultApp: App | null;
  onboardingCompleted: boolean;
  pinnedProjects: string[];
  recentProjects: RecentProject[];
  recentProjectsCount: number;
  showFzfStatus: boolean;
  showGitStatus: boolean;
  showRecentProjects: boolean;
  terminalApp: App | null;
  workspaceApps: Record<string, App>;
  workspaces: string[];
}

export interface GitCommit {
  author: string;
  hash: string;
  message: string;
  relativeTime: string;
}

export interface GitStatus {
  branch: string;
  dirty: number;
  pull: number;
  push: number;
}

export interface Project {
  fullPath: string;
  gitStatus?: GitStatus | null;
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
  version: 1;
}
