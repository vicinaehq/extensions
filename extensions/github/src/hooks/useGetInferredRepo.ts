import { useMemo } from "react";
import { Repository } from "../types";
import { useGetGitContext } from "./useGetGitContext";
import { useGetMyRepos } from "./useGetRepos";

export function useGetInferredRepo(path?: string): Repository | null {
  const gitContext = useGetGitContext(path);
  const { data: repos = [] } = useGetMyRepos();

  return useMemo(
    () =>
      repos.find((repo) => repo.full_name === gitContext?.inferredFullName) ||
      null,
    [gitContext?.inferredFullName, repos],
  );
}
