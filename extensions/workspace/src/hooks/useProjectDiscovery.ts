import { LocalStorage } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";

import { Project } from "@/types";
import { STORAGE_KEY_PROJECTS_CACHE } from "@/utils/constants";
import { type ScanOptions, scanWorkspaceProjects } from "@/utils/discovery";
import { getGitStatus, isGitAvailable, isGitRepo } from "@/utils/git";

const GIT_CONCURRENCY = 16;

type ProjectsCache = {
  projects: Project[];
  showGitStatus: boolean;
  workspaces: string[];
};

let memoryCache: ProjectsCache | null = null;

type WorkspaceScan = {
  complete: boolean;
  projects: Project[];
  workspacePath: string;
};

export function useProjectDiscovery(
  workspaces: string[],
  showGitStatus: boolean,
  ready: boolean,
  scanOptions: ScanOptions,
  showStashCount = false,
  enabled = true,
) {
  const [projects, setProjects] = useState<Project[]>(() => memoryCache?.projects ?? []);
  const [cachedWorkspaces, setCachedWorkspaces] = useState<string[]>(() => memoryCache?.workspaces ?? []);
  const [isLoading, setIsLoading] = useState(() => memoryCache == null);
  const [hasScanned, setHasScanned] = useState(false);
  const [scannedWorkspaceRoots, setScannedWorkspaceRoots] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const showGitStatusRef = useRef(showGitStatus);
  const showStashCountRef = useRef(showStashCount);
  showGitStatusRef.current = showGitStatus;
  showStashCountRef.current = showStashCount;

  useEffect(() => {
    if (!enabled || memoryCache) {
      return;
    }

    let cancelled = false;

    void LocalStorage.getItem(STORAGE_KEY_PROJECTS_CACHE).then((raw) => {
      if (cancelled || raw === undefined || raw === null || memoryCache) {
        return;
      }

      try {
        const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as ProjectsCache;
        if (!Array.isArray(parsed?.projects)) {
          return;
        }

        remember(parsed, setProjects, setCachedWorkspaces, false);
        setIsLoading(false);
      } catch {
        // Ignore a corrupt cache and wait for a fresh scan.
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !ready) {
      return;
    }

    let cancelled = false;

    if (!memoryCache?.projects.length) {
      setIsLoading(true);
    }

    async function refresh() {
      const scans = await Promise.all(workspaces.map((workspacePath) => scanWorkspace(workspacePath, scanOptions)));
      if (cancelled) {
        return;
      }

      const previous = memoryCache?.projects ?? [];
      const scannedRoots = scans.filter((scan) => scan.complete).map((scan) => scan.workspacePath);
      const listed = scans.flatMap((scan) => {
        if (scan.complete) {
          return scan.projects;
        }
        // Truncated scans still list what was found, but failed scans keep the previous set.
        if (scan.projects.length > 0) {
          return scan.projects;
        }
        return previous.filter((project) => project.parentFolder === scan.workspacePath);
      });

      const previousByPath = new Map((memoryCache?.projects ?? []).map((project) => [project.fullPath, project]));
      const listedWithStaleGit = listed.map((project) => {
        const previousProject = previousByPath.get(project.fullPath);
        return {
          ...project,
          gitStatus: showGitStatus ? previousProject?.gitStatus : undefined,
          isGitRepo: previousProject?.isGitRepo ?? previousProject?.gitStatus != null,
        };
      });

      remember({ projects: listedWithStaleGit, showGitStatus, workspaces }, setProjects, setCachedWorkspaces);
      setScannedWorkspaceRoots(scannedRoots);
      setHasScanned(true);
      setIsLoading(false);

      if (listed.length === 0 || !(await isGitAvailable())) {
        return;
      }

      const resolved: Project[] = [];
      for (let i = 0; i < listed.length; i += GIT_CONCURRENCY) {
        if (cancelled) {
          return;
        }

        const chunk = listed.slice(i, i + GIT_CONCURRENCY);
        resolved.push(
          ...(await Promise.all(
            chunk.map(async (project) => {
              if (showGitStatus) {
                const gitStatus = await getGitStatus(project.fullPath, { includeStash: showStashCount });
                return { ...project, gitStatus, isGitRepo: gitStatus != null };
              }

              return { ...project, gitStatus: undefined, isGitRepo: await isGitRepo(project.fullPath) };
            }),
          )),
        );

        const merged = listed.map((project, index) => resolved[index] ?? listedWithStaleGit[index] ?? project);
        remember({ projects: merged, showGitStatus, workspaces }, setProjects, setCachedWorkspaces, false);
      }

      remember({ projects: resolved, showGitStatus, workspaces }, setProjects, setCachedWorkspaces);
    }

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    ready,
    scanOptions.ignorePatterns,
    scanOptions.includeNested,
    scanOptions.requireMarkers,
    scanOptions.scanDepth,
    showGitStatus,
    showStashCount,
    version,
    workspaces,
  ]);

  const loadData = useCallback(async () => {
    setVersion((current) => current + 1);
  }, []);

  const refreshProjectGit = useCallback(async (projectPath: string) => {
    const current = memoryCache?.projects ?? [];
    const index = current.findIndex((project) => project.fullPath === projectPath);
    if (index === -1) {
      return;
    }

    const showStatus = showGitStatusRef.current;
    const includeStash = showStashCountRef.current;
    let nextProject: Project;

    if (showStatus) {
      const gitStatus = await getGitStatus(projectPath, { includeStash });
      nextProject = {
        ...current[index],
        gitStatus,
        isGitRepo: gitStatus != null,
      };
    } else {
      nextProject = {
        ...current[index],
        gitStatus: undefined,
        isGitRepo: await isGitRepo(projectPath),
      };
    }

    const nextProjects = current.slice();
    nextProjects[index] = nextProject;
    remember(
      {
        projects: nextProjects,
        showGitStatus: memoryCache?.showGitStatus ?? showStatus,
        workspaces: memoryCache?.workspaces ?? [],
      },
      setProjects,
      setCachedWorkspaces,
    );
  }, []);

  return {
    cachedWorkspaces,
    hasScanned,
    isLoading,
    loadData,
    projects,
    refreshProjectGit,
    scannedWorkspaceRoots,
  };
}

export function clearProjectsCache() {
  memoryCache = { projects: [], showGitStatus: true, workspaces: [] };
  void LocalStorage.removeItem(STORAGE_KEY_PROJECTS_CACHE);
}

function remember(
  cache: ProjectsCache,
  setProjects: (projects: Project[]) => void,
  setCachedWorkspaces: (workspaces: string[]) => void,
  write = true,
) {
  memoryCache = cache;
  setProjects(cache.projects);
  setCachedWorkspaces(cache.workspaces);
  if (write) {
    persist(cache);
  }
}

function persist(cache: ProjectsCache) {
  void LocalStorage.setItem(STORAGE_KEY_PROJECTS_CACHE, JSON.stringify(cache));
}

async function scanWorkspace(workspacePath: string, options: ScanOptions): Promise<WorkspaceScan> {
  try {
    const { projects, truncated } = await scanWorkspaceProjects(workspacePath, options);
    return { complete: !truncated, projects, workspacePath };
  } catch {
    return { complete: false, projects: [], workspacePath };
  }
}
