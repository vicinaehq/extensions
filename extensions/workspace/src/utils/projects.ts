import { Project, RecentProject } from "@/types";
import { isPathInside } from "@/utils/paths";

export function organizeProjects({
  pinnedPaths,
  projects,
  recentProjects,
  recentProjectsCount,
  showRecentProjects,
  workspaces,
}: {
  pinnedPaths: string[];
  projects: Project[];
  recentProjects: RecentProject[];
  recentProjectsCount: number;
  showRecentProjects: boolean;
  workspaces: string[];
}): {
  hasVisibleProjects: boolean;
  pinnedList: Project[];
  projectsByWorkspace: Record<string, Project[]>;
  recentList: Project[];
} {
  const byPath = new Map(projects.map((project) => [project.fullPath, project]));
  const pinnedSet = new Set(pinnedPaths);

  const pinnedList = pinnedPaths.map((path) => byPath.get(path)).filter((project): project is Project => !!project);

  const recentList = showRecentProjects
    ? recentProjects
        .slice(0, recentProjectsCount)
        .map((entry) => byPath.get(entry.path))
        .filter((project): project is Project => !!project && !pinnedSet.has(project.fullPath))
    : [];

  const hidden = new Set<string>();
  for (const project of pinnedList) {
    hidden.add(project.fullPath);
  }
  for (const project of recentList) {
    hidden.add(project.fullPath);
  }

  const projectsByWorkspace: Record<string, Project[]> = {};
  for (const workspace of workspaces) {
    projectsByWorkspace[workspace] = [];
  }

  for (const project of projects) {
    if (hidden.has(project.fullPath)) {
      continue;
    }

    const bucket = projectsByWorkspace[project.parentFolder];
    if (bucket) {
      bucket.push(project);
    }
  }

  const hasVisibleProjects =
    pinnedList.length > 0 ||
    recentList.length > 0 ||
    workspaces.some((workspace) => (projectsByWorkspace[workspace]?.length ?? 0) > 0);

  return { hasVisibleProjects, pinnedList, projectsByWorkspace, recentList };
}

export function keepSavedProjectPaths(
  savedPaths: string[],
  projectPaths: Set<string>,
  configuredWorkspaces: string[],
  scannedWorkspaces: string[],
): string[] {
  return savedPaths.filter((savedPath) =>
    shouldKeepSavedPath(savedPath, projectPaths, configuredWorkspaces, scannedWorkspaces),
  );
}

function shouldKeepSavedPath(
  savedPath: string,
  projectPaths: Set<string>,
  configuredWorkspaces: string[],
  scannedWorkspaces: string[],
): boolean {
  if (projectPaths.has(savedPath)) {
    return true;
  }

  const workspace = mostSpecificWorkspace(savedPath, configuredWorkspaces);
  if (!workspace) {
    return false;
  }

  return !scannedWorkspaces.includes(workspace);
}

function mostSpecificWorkspace(savedPath: string, configuredWorkspaces: string[]): string | undefined {
  let workspace: string | undefined;

  for (const root of configuredWorkspaces) {
    if (!isPathInside(root, savedPath)) {
      continue;
    }

    if (!workspace || root.length > workspace.length) {
      workspace = root;
    }
  }

  return workspace;
}
