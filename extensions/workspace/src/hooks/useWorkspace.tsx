import { createContext, type ReactNode, useContext, useEffect } from "react";

import { useCachedPromise } from "@/hooks/useCachedPromise";
import { usePreferences } from "@/hooks/usePreferences";
import { useProjectDiscovery } from "@/hooks/useProjectDiscovery";
import { useRecentProjects } from "@/hooks/useRecentProjects";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { App, ExportedSettings, Project, RecentProject, ViewMode } from "@/types";
import { getFzfPath } from "@/utils/fzf";
import { isGitAvailable } from "@/utils/git";
import { exportSettingsToDownloads, importSettingsFromFile } from "@/utils/storage";

export interface UseWorkspaceReturn {
  applyImportedSettings: (settings: ExportedSettings) => Promise<void>;
  defaultApp: App | null;
  exportSettings: () => Promise<void>;
  fzfAvailable: boolean | null;
  fzfPath: null | string;
  gitAvailable: boolean | null;
  importSettings: (filePath: string) => Promise<boolean>;
  isLoading: boolean;
  loadData: () => Promise<void>;
  onboardingCompleted: boolean;
  onboardingHydrated: boolean;
  pinnedProjects: string[];
  projects: Project[];
  recentProjects: RecentProject[];
  recentProjectsCount: number;
  recordProjectOpen: (projectPath: string) => Promise<void>;
  reorderPinnedProject: (projectPath: string, direction: "down" | "up") => Promise<void>;
  setOnboardingCompleted: (completed: boolean) => Promise<void>;
  showFzfStatus: boolean;
  showGitStatus: boolean;
  showRecentProjects: boolean;
  terminalApp: App | null;
  togglePinProject: (projectPath: string) => Promise<void>;
  toggleViewMode: () => Promise<void>;
  updateDefaultApp: (app: App | null) => Promise<void>;
  updateRecentProjectsCount: (count: number) => Promise<void>;
  updateShowFzfStatus: (show: boolean) => Promise<void>;
  updateShowGitStatus: (show: boolean) => Promise<void>;
  updateShowRecentProjects: (show: boolean) => Promise<void>;
  updateTerminalApp: (app: App | null) => Promise<void>;
  updateViewMode: (mode: ViewMode) => Promise<void>;
  updateWorkspaceApps: (newWorkspaceApps: Record<string, App>) => Promise<void>;
  updateWorkspaces: (newWorkspaces: string[]) => Promise<void>;
  viewMode: ViewMode;
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
  const pd = useProjectDiscovery(
    ws.workspaces,
    pref.showGitStatus,
    discover && ws.isHydrated && pref.gitStatusHydrated,
    discover,
  );

  const { data: gitAvailable } = useCachedPromise(isGitAvailable, []);
  const { data: fzfPath } = useCachedPromise(getFzfPath, []);

  const snapshot = (): ExportedSettings => ({
    defaultApp: pref.defaultApp,
    onboardingCompleted: pref.onboardingCompleted,
    pinnedProjects: rp.pinnedProjects,
    recentProjects: rp.recentProjects,
    recentProjectsCount: rp.recentProjectsCount,
    showFzfStatus: pref.showFzfStatus,
    showGitStatus: pref.showGitStatus,
    showRecentProjects: pref.showRecentProjects,
    terminalApp: pref.terminalApp,
    viewMode: pref.viewMode,
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
      pref.updateShowFzfStatus(settings.showFzfStatus),
      pref.updateShowRecentProjects(settings.showRecentProjects),
      rp.updateRecentProjects(settings.recentProjects),
      rp.updateRecentProjectsCount(settings.recentProjectsCount),
      pref.updateViewMode(settings.viewMode),
      pref.setOnboardingCompleted(settings.onboardingCompleted),
    ]);
  };

  const importSettings = async (filePath: string): Promise<boolean> => {
    const imported = await importSettingsFromFile(filePath, snapshot());
    if (!imported) return false;
    await applyImportedSettings(imported);
    if (discover) {
      await pd.loadData();
    }
    return true;
  };

  useEffect(() => {
    if (!discover || !pd.hasScanned) {
      return;
    }

    pruneMissingProjects(
      pd.projects,
      rp.pinnedProjects,
      rp.recentProjects,
      rp.updatePinnedProjects,
      rp.updateRecentProjects,
    );
  }, [discover, pd.hasScanned, pd.projects]);

  return {
    applyImportedSettings,
    defaultApp: pref.defaultApp,
    exportSettings: () => exportSettingsToDownloads(snapshot()),
    fzfAvailable: fzfPath === undefined ? null : fzfPath !== null,
    fzfPath: fzfPath ?? null,
    gitAvailable: gitAvailable ?? null,
    importSettings,
    isLoading: discover && pd.isLoading && pd.projects.length === 0,
    loadData: pd.loadData,
    onboardingCompleted: pref.onboardingCompleted,
    onboardingHydrated: pref.onboardingHydrated,
    pinnedProjects: rp.pinnedProjects,
    projects: pd.projects,
    recentProjects: rp.recentProjects,
    recentProjectsCount: rp.recentProjectsCount,
    recordProjectOpen: rp.recordProjectOpen,
    reorderPinnedProject: rp.reorderPinnedProject,
    setOnboardingCompleted: pref.setOnboardingCompleted,
    showFzfStatus: pref.showFzfStatus,
    showGitStatus: pref.showGitStatus,
    showRecentProjects: pref.showRecentProjects,
    terminalApp: pref.terminalApp,
    togglePinProject: rp.togglePinProject,
    toggleViewMode: pref.toggleViewMode,
    updateDefaultApp: pref.updateDefaultApp,
    updateRecentProjectsCount: rp.updateRecentProjectsCount,
    updateShowFzfStatus: pref.updateShowFzfStatus,
    updateShowGitStatus: pref.updateShowGitStatus,
    updateShowRecentProjects: pref.updateShowRecentProjects,
    updateTerminalApp: pref.updateTerminalApp,
    updateViewMode: pref.updateViewMode,
    updateWorkspaceApps: ws.updateWorkspaceApps,
    updateWorkspaces: ws.updateWorkspaces,
    viewMode: pref.viewMode,
    workspaceApps: ws.workspaceApps,
    workspaces: ws.isHydrated || !discover ? ws.workspaces : pd.cachedWorkspaces,
  };
}

function pruneMissingProjects(
  projects: Project[],
  pinnedProjects: string[],
  recentProjects: RecentProject[],
  updatePinnedProjects: (projects: string[]) => Promise<void>,
  updateRecentProjects: (projects: RecentProject[]) => Promise<void>,
) {
  if (projects.length === 0) return;

  const projectPaths = new Set(projects.map((project) => project.fullPath));

  if (pinnedProjects.length > 0) {
    const nextPinned = pinnedProjects.filter((path) => projectPaths.has(path));
    if (nextPinned.length !== pinnedProjects.length) {
      void updatePinnedProjects(nextPinned);
    }
  }

  if (recentProjects.length > 0) {
    const nextRecent = recentProjects.filter((entry) => projectPaths.has(entry.path));
    if (nextRecent.length !== recentProjects.length) {
      void updateRecentProjects(nextRecent);
    }
  }
}
