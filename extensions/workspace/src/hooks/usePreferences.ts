import { useCachedState } from "@/hooks/useCachedState";

import { App } from "@/types";
import {
  STORAGE_KEY_APP,
  STORAGE_KEY_IGNORE_PATTERNS,
  STORAGE_KEY_INCLUDE_NESTED,
  STORAGE_KEY_ONBOARDING_COMPLETED,
  STORAGE_KEY_REQUIRE_MARKERS,
  STORAGE_KEY_SCAN_DEPTH,
  STORAGE_KEY_SHOW_GIT_STATUS,
  STORAGE_KEY_SHOW_RECENT_PROJECTS,
  STORAGE_KEY_SHOW_STASH_COUNT,
  STORAGE_KEY_TERMINAL_APP,
} from "@/utils/constants";
import {
  clampScanDepth,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_SCAN_DEPTH,
  normalizeIgnorePatterns,
} from "@/utils/discovery";

export function usePreferences() {
  const [defaultApp, setDefaultApp] = useCachedState<App | null>(STORAGE_KEY_APP, null);
  const [terminalApp, setTerminalApp] = useCachedState<App | null>(STORAGE_KEY_TERMINAL_APP, null);
  const [onboardingCompleted, setOnboardingCompleted, onboardingHydrated] = useCachedState<boolean>(
    STORAGE_KEY_ONBOARDING_COMPLETED,
    false,
  );
  const [showGitStatus, setShowGitStatus, gitStatusHydrated] = useCachedState<boolean>(
    STORAGE_KEY_SHOW_GIT_STATUS,
    true,
  );
  const [showStashCount, setShowStashCount] = useCachedState<boolean>(STORAGE_KEY_SHOW_STASH_COUNT, false);
  const [showRecentProjects, setShowRecentProjects] = useCachedState<boolean>(STORAGE_KEY_SHOW_RECENT_PROJECTS, false);
  const [scanDepth, setScanDepth, discoveryHydrated] = useCachedState<number>(
    STORAGE_KEY_SCAN_DEPTH,
    DEFAULT_SCAN_DEPTH,
  );
  const [ignorePatterns, setIgnorePatterns] = useCachedState<string[]>(
    STORAGE_KEY_IGNORE_PATTERNS,
    DEFAULT_IGNORE_PATTERNS,
  );
  const [includeNested, setIncludeNested] = useCachedState<boolean>(STORAGE_KEY_INCLUDE_NESTED, false);
  const [requireMarkers, setRequireMarkers] = useCachedState<boolean>(STORAGE_KEY_REQUIRE_MARKERS, false);

  const updateDefaultApp = async (app: App | null): Promise<void> => setDefaultApp(app);
  const updateTerminalApp = async (app: App | null): Promise<void> => setTerminalApp(app);
  const setOnboardingCompletedState = async (completed: boolean): Promise<void> => setOnboardingCompleted(completed);
  const updateShowGitStatus = async (show: boolean): Promise<void> => setShowGitStatus(show);
  const updateShowStashCount = async (show: boolean): Promise<void> => setShowStashCount(show);
  const updateShowRecentProjects = async (show: boolean): Promise<void> => setShowRecentProjects(show);
  const updateScanDepth = async (depth: number): Promise<void> => setScanDepth(clampScanDepth(depth));
  const updateIgnorePatterns = async (patterns: string[]): Promise<void> =>
    setIgnorePatterns(normalizeIgnorePatterns(patterns, DEFAULT_IGNORE_PATTERNS));
  const updateIncludeNested = async (value: boolean): Promise<void> => setIncludeNested(value);
  const updateRequireMarkers = async (value: boolean): Promise<void> => setRequireMarkers(value);

  return {
    defaultApp,
    discoveryHydrated,
    gitStatusHydrated,
    ignorePatterns,
    includeNested,
    onboardingCompleted,
    onboardingHydrated,
    requireMarkers,
    scanDepth: clampScanDepth(scanDepth),
    setOnboardingCompleted: setOnboardingCompletedState,
    showGitStatus,
    showRecentProjects,
    showStashCount,
    terminalApp,
    updateDefaultApp,
    updateIgnorePatterns,
    updateIncludeNested,
    updateRequireMarkers,
    updateScanDepth,
    updateShowGitStatus,
    updateShowRecentProjects,
    updateShowStashCount,
    updateTerminalApp,
  };
}
