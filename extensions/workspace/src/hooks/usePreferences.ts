import { useCachedState } from "@/hooks/useCachedState";

import { App, ViewMode } from "@/types";
import {
  STORAGE_KEY_APP,
  STORAGE_KEY_ONBOARDING_COMPLETED,
  STORAGE_KEY_SHOW_FZF_STATUS,
  STORAGE_KEY_SHOW_GIT_STATUS,
  STORAGE_KEY_SHOW_RECENT_PROJECTS,
  STORAGE_KEY_TERMINAL_APP,
  STORAGE_KEY_VIEW_MODE,
} from "@/utils/constants";

export function usePreferences() {
  const [defaultApp, setDefaultApp] = useCachedState<App | null>(STORAGE_KEY_APP, null);
  const [terminalApp, setTerminalApp] = useCachedState<App | null>(STORAGE_KEY_TERMINAL_APP, null);
  const [viewMode, setViewMode] = useCachedState<ViewMode>(STORAGE_KEY_VIEW_MODE, "list");
  const [onboardingCompleted, setOnboardingCompleted, onboardingHydrated] = useCachedState<boolean>(
    STORAGE_KEY_ONBOARDING_COMPLETED,
    false,
  );
  const [showFzfStatus, setShowFzfStatus] = useCachedState<boolean>(STORAGE_KEY_SHOW_FZF_STATUS, true);
  const [showGitStatus, setShowGitStatus, gitStatusHydrated] = useCachedState<boolean>(
    STORAGE_KEY_SHOW_GIT_STATUS,
    true,
  );
  const [showRecentProjects, setShowRecentProjects] = useCachedState<boolean>(STORAGE_KEY_SHOW_RECENT_PROJECTS, false);

  const updateDefaultApp = async (app: App | null): Promise<void> => setDefaultApp(app);
  const updateTerminalApp = async (app: App | null): Promise<void> => setTerminalApp(app);
  const updateViewMode = async (mode: ViewMode): Promise<void> => setViewMode(mode);
  const toggleViewMode = async (): Promise<void> => setViewMode(viewMode === "grid" ? "list" : "grid");
  const setOnboardingCompletedState = async (completed: boolean): Promise<void> => setOnboardingCompleted(completed);
  const updateShowFzfStatus = async (show: boolean): Promise<void> => setShowFzfStatus(show);
  const updateShowGitStatus = async (show: boolean): Promise<void> => setShowGitStatus(show);
  const updateShowRecentProjects = async (show: boolean): Promise<void> => setShowRecentProjects(show);

  return {
    defaultApp,
    gitStatusHydrated,
    onboardingCompleted,
    onboardingHydrated,
    setOnboardingCompleted: setOnboardingCompletedState,
    showFzfStatus,
    showGitStatus,
    showRecentProjects,
    terminalApp,
    toggleViewMode,
    updateDefaultApp,
    updateShowFzfStatus,
    updateShowGitStatus,
    updateShowRecentProjects,
    updateTerminalApp,
    updateViewMode,
    viewMode: viewMode ?? "list",
  };
}
