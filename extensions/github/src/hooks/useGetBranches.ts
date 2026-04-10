import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Branch, Repository } from "../types";
import { octokitPaginate } from "../api/octokitPaginate";

const defaultValue: Branch[] = [];
export const useGetBranches = (repo: Repository | null) => {
  return useQuery<Branch[]>({
    queryKey: ["githubBranches", repo?.id],
    queryFn: async () => {
      if (!repo) return defaultValue;
      const [owner, repoName] = repo.full_name.split("/");
      const branches = await octokitPaginate(octokit.repos.listBranches, {
        owner,
        repo: repoName,
        per_page: 100,
      });

      return branches;
    },
    enabled: !!repo,
  });
};
