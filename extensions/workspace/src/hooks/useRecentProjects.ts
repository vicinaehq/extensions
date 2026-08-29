import { useCachedState } from "@/hooks/useCachedState";

import { RecentProject } from "@/types";
import {
  DEFAULT_RECENT_PROJECTS_COUNT,
  STORAGE_KEY_PINNED_PROJECTS,
  STORAGE_KEY_RECENT_PROJECTS,
  STORAGE_KEY_RECENT_PROJECTS_COUNT,
} from "@/utils/constants";

export function useRecentProjects() {
  const [pinnedProjects, setPinnedProjects, pinnedHydrated] = useCachedState<string[]>(STORAGE_KEY_PINNED_PROJECTS, []);
  const [recentProjects, setRecentProjects, recentHydrated] = useCachedState<RecentProject[]>(
    STORAGE_KEY_RECENT_PROJECTS,
    [],
  );
  const [recentProjectsCount, setRecentProjectsCount] = useCachedState<number>(
    STORAGE_KEY_RECENT_PROJECTS_COUNT,
    DEFAULT_RECENT_PROJECTS_COUNT,
  );

  const updatePinnedProjects = async (projects: string[]): Promise<void> => setPinnedProjects(projects);
  const updateRecentProjects = async (projects: RecentProject[]): Promise<void> => setRecentProjects(projects);
  const updateRecentProjectsCount = async (count: number): Promise<void> => setRecentProjectsCount(count);

  const togglePinProject = async (projectPath: string): Promise<void> => {
    let newPinned: string[];
    if (pinnedProjects.includes(projectPath)) {
      newPinned = pinnedProjects.filter((p: string) => p !== projectPath);
    } else {
      newPinned = [...pinnedProjects, projectPath];

      const newRecent = recentProjects.filter((r) => r.path !== projectPath);
      if (newRecent.length !== recentProjects.length) {
        setRecentProjects(newRecent);
      }
    }

    setPinnedProjects(newPinned);
  };

  const reorderPinnedProject = async (projectPath: string, direction: "down" | "up"): Promise<void> => {
    const from = pinnedProjects.indexOf(projectPath);
    if (from === -1) return;

    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= pinnedProjects.length) return;

    const next = pinnedProjects.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    setPinnedProjects(next);
  };

  const recordProjectOpen = async (projectPath: string): Promise<void> => {
    if (pinnedProjects.includes(projectPath)) {
      return;
    }

    const now = Date.now();
    const filtered = recentProjects.filter((r) => r.path !== projectPath);
    const updated = [{ lastOpened: now, path: projectPath }, ...filtered].slice(0, recentProjectsCount);

    setRecentProjects(updated);
  };

  return {
    isHydrated: pinnedHydrated && recentHydrated,
    pinnedProjects: pinnedProjects ?? [],
    recentProjects: recentProjects ?? [],
    recentProjectsCount: recentProjectsCount ?? DEFAULT_RECENT_PROJECTS_COUNT,
    recordProjectOpen,
    reorderPinnedProject,
    togglePinProject,
    updatePinnedProjects,
    updateRecentProjects,
    updateRecentProjectsCount,
  };
}
