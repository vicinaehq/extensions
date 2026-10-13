import { showToast, Toast } from "@vicinae/api";
import path from "path";
import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";

import { useCachedPromise } from "@/hooks/useCachedPromise";
import { usePreferences } from "@/hooks/usePreferences";
import { clearProjectsCache, useProjectDiscovery } from "@/hooks/useProjectDiscovery";
import { useRecentProjects } from "@/hooks/useRecentProjects";
import { useTags } from "@/hooks/useTags";
import { useUsageStats } from "@/hooks/useUsageStats";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { App, ExportedSettings, Project, RecentProject, Tag } from "@/types";
import { isGitAvailable } from "@/utils/git";
import { keepSavedProjectPaths } from "@/utils/projects";
import { DEFAULT_SETTINGS, exportSettingsToDownloads, importSettingsFromFile } from "@/utils/storage";
import type { UsageSnapshot } from "@/utils/usage";
import { Color } from "@vicinae/api";

export interface UseWorkspaceReturn {
  applyImportedSettings: (settings: ExportedSettings) => Promise<void>;
  assignTag: (projectPath: string, tagId: string) => Promise<void>;
  clearUsageStats: () => Promise<void>;
  createTag: (name: string, color?: Color) => Promise<Tag | null>;
  defaultApp: App | null;
  deleteTag: (tagId: string) => Promise<void>;
  exportSettings: () => Promise<void>;
  getProjectTags: (projectPath: string) => Tag[];
  gitAvailable: boolean | null;
  ignorePatterns: string[];
  importSettings: (filePath: string) => Promise<boolean>;
  includeNested: boolean;
  isLoading: boolean;
  loadData: () => Promise<void>;
  onboardingCompleted: boolean;
  onboardingHydrated: boolean;
  pinnedProjects: string[];
  projectTags: Record<string, string[]>;
  projects: Project[];
  recentProjects: RecentProject[];
  recentProjectsCount: number;
  recordProjectOpen: (projectPath: string) => Promise<void>;
  refreshProjectGit: (projectPath: string) => Promise<void>;
  reorderPinnedProject: (projectPath: string, direction: "down" | "up") => Promise<void>;
  requireMarkers: boolean;
  resetExtension: () => Promise<void>;
  scanDepth: number;
  setOnboardingCompleted: (completed: boolean) => Promise<void>;
  showGitStatus: boolean;
  showRecentProjects: boolean;
  showStashCount: boolean;
  tags: Tag[];
  terminalApp: App | null;
  togglePinProject: (projectPath: string) => Promise<void>;
  unassignTag: (projectPath: string, tagId: string) => Promise<void>;
  updateDefaultApp: (app: App | null) => Promise<void>;
  updateIgnorePatterns: (patterns: string[]) => Promise<void>;
  updateIncludeNested: (value: boolean) => Promise<void>;
  updateRecentProjectsCount: (count: number) => Promise<void>;
  updateRequireMarkers: (value: boolean) => Promise<void>;
  updateScanDepth: (depth: number) => Promise<void>;
  updateShowGitStatus: (show: boolean) => Promise<void>;
  updateShowRecentProjects: (show: boolean) => Promise<void>;
  updateShowStashCount: (show: boolean) => Promise<void>;
  updateTag: (tagId: string, patch: Partial<Pick<Tag, "color" | "name">>) => Promise<void>;
  updateTerminalApp: (app: App | null) => Promise<void>;
  updateWorkspaceApps: (newWorkspaceApps: Record<string, App>) => Promise<void>;
  updateWorkspaces: (newWorkspaces: string[]) => Promise<void>;
  usageSnapshot: UsageSnapshot;
  workspaceApps: Record<string, App>;
  workspaces: string[];
}

const WorkspaceContext = createContext<UseWorkspaceReturn | null>(null);

export function WorkspaceProvider({ children, discover = true }: { children: ReactNode; discover?: boolean }) {
  const value = useWorkspaceStore(discover);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): UseWorkspaceReturn {
  const value = useContext(WorkspaceContext);
  const standalone = useWorkspaceStore(false);
  return value ?? standalone;
}

function useWorkspaceStore(discover: boolean): UseWorkspaceReturn {
  const pref = usePreferences();
  const ws = useWorkspaces();
  const rp = useRecentProjects();
  const usage = useUsageStats();
  const tagStore = useTags();
  const scanOptions = useMemo(
    () => ({
      ignorePatterns: pref.ignorePatterns,
      includeNested: pref.includeNested,
      requireMarkers: pref.requireMarkers,
      scanDepth: pref.scanDepth,
    }),
    [pref.ignorePatterns, pref.includeNested, pref.requireMarkers, pref.scanDepth],
  );
  const pd = useProjectDiscovery(
    ws.workspaces,
    pref.showGitStatus,
    discover && ws.isHydrated && pref.gitStatusHydrated && pref.discoveryHydrated,
    scanOptions,
    pref.showStashCount,
    discover,
  );

  const { data: gitAvailable } = useCachedPromise(isGitAvailable, []);

  const snapshot = (): ExportedSettings => ({
    defaultApp: pref.defaultApp,
    ignorePatterns: pref.ignorePatterns,
    includeNested: pref.includeNested,
    onboardingCompleted: pref.onboardingCompleted,
    pinnedProjects: rp.pinnedProjects,
    projectTags: tagStore.projectTags,
    recentProjects: rp.recentProjects,
    recentProjectsCount: rp.recentProjectsCount,
    requireMarkers: pref.requireMarkers,
    scanDepth: pref.scanDepth,
    showGitStatus: pref.showGitStatus,
    showRecentProjects: pref.showRecentProjects,
    showStashCount: pref.showStashCount,
    tags: tagStore.tags,
    terminalApp: pref.terminalApp,
    usage: usage.store,
    workspaceApps: ws.workspaceApps,
    workspaces: ws.workspaces,
  });

  const applyImportedSettings = async (settings: ExportedSettings): Promise<void> => {
    await Promise.all([
      pref.updateDefaultApp(settings.defaultApp),
      pref.updateTerminalApp(settings.terminalApp),
      ws.updateWorkspaces(settings.workspaces),
      ws.updateWorkspaceApps(settings.workspaceApps),
      rp.updatePinnedProjects(settings.pinnedProjects),
      pref.updateShowGitStatus(settings.showGitStatus),
      pref.updateShowStashCount(settings.showStashCount ?? false),
      pref.updateShowRecentProjects(settings.showRecentProjects),
      rp.updateRecentProjects(settings.recentProjects),
      rp.updateRecentProjectsCount(settings.recentProjectsCount),
      pref.setOnboardingCompleted(settings.onboardingCompleted),
      pref.updateScanDepth(settings.scanDepth),
      pref.updateIgnorePatterns(settings.ignorePatterns),
      pref.updateIncludeNested(settings.includeNested),
      pref.updateRequireMarkers(settings.requireMarkers),
      tagStore.replaceTags(settings.tags ?? [], settings.projectTags ?? {}),
    ]);
    if (settings.usage) {
      await usage.replaceUsage(settings.usage);
    }
  };

  const importSettings = async (filePath: string): Promise<boolean> => {
    const imported = await importSettingsFromFile(filePath, snapshot());
    if (!imported) return false;
    await applyImportedSettings(imported);
    if (discover) {
      await pd.loadData();
    }
    await showToast({
      message: path.basename(filePath),
      style: Toast.Style.Success,
      title: "Settings imported",
    });
    return true;
  };

  const resetExtension = async (): Promise<void> => {
    await applyImportedSettings(DEFAULT_SETTINGS);
    clearProjectsCache();
    await usage.clearUsage();
    if (discover) {
      await pd.loadData();
    }
  };

  const recordProjectOpen = async (projectPath: string): Promise<void> => {
    await Promise.all([usage.recordProjectOpen(projectPath), rp.recordProjectOpen(projectPath)]);
  };

  useEffect(() => {
    if (!discover || !pd.hasScanned || !rp.isHydrated) {
      return;
    }

    pruneMissingProjects(
      pd.projects,
      ws.workspaces,
      pd.scannedWorkspaceRoots,
      rp.pinnedProjects,
      rp.recentProjects,
      rp.updatePinnedProjects,
      rp.updateRecentProjects,
    );
  }, [
    discover,
    pd.hasScanned,
    pd.projects,
    pd.scannedWorkspaceRoots,
    rp.isHydrated,
    rp.pinnedProjects,
    rp.recentProjects,
    ws.workspaces,
  ]);

  return {
    applyImportedSettings,
    assignTag: tagStore.assignTag,
    clearUsageStats: usage.clearUsage,
    createTag: tagStore.createTag,
    defaultApp: pref.defaultApp,
    deleteTag: tagStore.deleteTag,
    exportSettings: () => exportSettingsToDownloads(snapshot()),
    getProjectTags: tagStore.getProjectTags,
    gitAvailable: gitAvailable ?? null,
    ignorePatterns: pref.ignorePatterns,
    importSettings,
    includeNested: pref.includeNested,
    isLoading: discover && pd.isLoading && pd.projects.length === 0,
    loadData: pd.loadData,
    onboardingCompleted: pref.onboardingCompleted,
    onboardingHydrated: pref.onboardingHydrated,
    pinnedProjects: rp.pinnedProjects,
    projectTags: tagStore.projectTags,
    projects: pd.projects,
    recentProjects: rp.recentProjects,
    recentProjectsCount: rp.recentProjectsCount,
    recordProjectOpen,
    refreshProjectGit: pd.refreshProjectGit,
    reorderPinnedProject: rp.reorderPinnedProject,
    requireMarkers: pref.requireMarkers,
    resetExtension,
    scanDepth: pref.scanDepth,
    setOnboardingCompleted: pref.setOnboardingCompleted,
    showGitStatus: pref.showGitStatus,
    showRecentProjects: pref.showRecentProjects,
    showStashCount: pref.showStashCount,
    tags: tagStore.tags,
    terminalApp: pref.terminalApp,
    togglePinProject: rp.togglePinProject,
    unassignTag: tagStore.unassignTag,
    updateDefaultApp: pref.updateDefaultApp,
    updateIgnorePatterns: pref.updateIgnorePatterns,
    updateIncludeNested: pref.updateIncludeNested,
    updateRecentProjectsCount: rp.updateRecentProjectsCount,
    updateRequireMarkers: pref.updateRequireMarkers,
    updateScanDepth: pref.updateScanDepth,
    updateShowGitStatus: pref.updateShowGitStatus,
    updateShowRecentProjects: pref.updateShowRecentProjects,
    updateShowStashCount: pref.updateShowStashCount,
    updateTag: tagStore.updateTag,
    updateTerminalApp: pref.updateTerminalApp,
    updateWorkspaceApps: ws.updateWorkspaceApps,
    updateWorkspaces: ws.updateWorkspaces,
    usageSnapshot: usage.snapshot,
    workspaceApps: ws.workspaceApps,
    workspaces: ws.isHydrated || !discover ? ws.workspaces : pd.cachedWorkspaces,
  };
}

function pruneMissingProjects(
  projects: Project[],
  workspaces: string[],
  scannedWorkspaceRoots: string[],
  pinnedProjects: string[],
  recentProjects: RecentProject[],
  updatePinnedProjects: (projects: string[]) => Promise<void>,
  updateRecentProjects: (projects: RecentProject[]) => Promise<void>,
) {
  const projectPaths = new Set(projects.map((project) => project.fullPath));

  if (pinnedProjects.length > 0) {
    const nextPinned = keepSavedProjectPaths(pinnedProjects, projectPaths, workspaces, scannedWorkspaceRoots);
    if (nextPinned.length !== pinnedProjects.length) {
      void updatePinnedProjects(nextPinned);
    }
  }

  if (recentProjects.length > 0) {
    const nextRecent = keepSavedProjectPaths(
      recentProjects.map((entry) => entry.path),
      projectPaths,
      workspaces,
      scannedWorkspaceRoots,
    );
    if (nextRecent.length !== recentProjects.length) {
      const keep = new Set(nextRecent);
      void updateRecentProjects(recentProjects.filter((entry) => keep.has(entry.path)));
    }
  }
}
