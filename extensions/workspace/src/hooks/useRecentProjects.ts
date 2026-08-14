import { useCachedState } from "@/hooks/useCachedState";

import { RecentProject } from "@/types";
import {
  DEFAULT_RECENT_PROJECTS_COUNT,
  STORAGE_KEY_PINNED_PROJECTS,
  STORAGE_KEY_RECENT_PROJECTS,
  STORAGE_KEY_RECENT_PROJECTS_COUNT,
} from "@/utils/constants";

export function useRecentProjects() {
  const [pinnedProjects, setPinnedProjects] = useCachedState<string[]>(STORAGE_KEY_PINNED_PROJECTS, []);
  const [recentProjects, setRecentProjects] = useCachedState<RecentProject[]>(STORAGE_KEY_RECENT_PROJECTS, []);
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

      // Remove from recent projects if it was pinned
      const newRecent = recentProjects.filter((r) => r.path !== projectPath);
      if (newRecent.length !== recentProjects.length) {
        setRecentProjects(newRecent);
      }
    }

    setPinnedProjects(newPinned);
  };

  const reorderPinnedProject = async (projectPath: string, direction: "down" | "up"): Promise<void> => {
    const index = pinnedProjects.indexOf(projectPath);
    if (index === -1) return;

    const newPinned = [...pinnedProjects];
    if (direction === "up" && index > 0) {
      [newPinned[index], newPinned[index - 1]] = [newPinned[index - 1], newPinned[index]];
    } else if (direction === "down" && index < newPinned.length - 1) {
      [newPinned[index], newPinned[index + 1]] = [newPinned[index + 1], newPinned[index]];
    } else {
      return;
    }

    setPinnedProjects(newPinned);
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
