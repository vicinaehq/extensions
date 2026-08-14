import { useEffect, useMemo, useState } from "react";

import { Project } from "@/types";
import { fuzzySearch } from "@/utils/fzf";
import { filterProjectsByQuery } from "@/utils/projects";

const FZF_DEBOUNCE_MS = 80;

export function useProjectSearch(
  projects: Project[],
  searchText: string,
  options: { fzfAvailable: boolean; fzfPath: string | null; showFzfStatus: boolean; showGitStatus: boolean },
): Project[] {
  const substringMatches = useMemo(
    () => filterProjectsByQuery(projects, searchText, options.showGitStatus),
    [projects, searchText, options.showGitStatus],
  );

  const canUseFzf = Boolean(searchText && options.fzfAvailable && options.fzfPath && options.showFzfStatus);
  const [fzfMatches, setFzfMatches] = useState<Project[] | null>(null);

  useEffect(() => {
    setFzfMatches(null);

    if (!canUseFzf || !options.fzfPath) {
      return;
    }

    const fzfPath = options.fzfPath;
    const timer = setTimeout(() => {
      const results = fuzzySearch(projects, searchText, fzfPath);
      setFzfMatches(results.length > 0 ? results : null);
    }, FZF_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [canUseFzf, options.fzfPath, projects, searchText]);

  if (!searchText) {
    return projects;
  }

  return fzfMatches ?? substringMatches;
}
