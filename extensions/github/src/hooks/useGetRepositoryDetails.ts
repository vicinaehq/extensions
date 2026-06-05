import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Repository, RepositoryDetails } from "../types";

export const useGetRepositoryDetails = (repo: Repository | null) => {
  return useQuery<RepositoryDetails | null>({
    queryKey: ["githubRepositoryDetails", repo?.full_name],
    queryFn: async () => {
      if (!repo) return null;

      const [owner, repoName] = repo.full_name.split("/");
      const response = await octokit.repos.get({
        owner,
        repo: repoName,
      });

      return response.data;
    },
    enabled: !!repo,
  });
};
