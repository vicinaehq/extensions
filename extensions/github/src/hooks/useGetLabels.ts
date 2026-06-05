import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Label, Repository } from "../types";
import { octokitPaginate } from "../api/octokitPaginate";

const defaultValue: Label[] = [];
export const useGetLabels = (repo: Repository | null) => {
  return useQuery<Label[]>({
    queryKey: ["githubLabels", repo?.id],
    queryFn: async () => {
      if (!repo) return defaultValue;
      const [owner, repoName] = repo.full_name.split("/");
      const labels = await octokitPaginate(octokit.issues.listLabelsForRepo, {
        owner,
        repo: repoName,
        per_page: 100,
      });

      return labels;
    },
    enabled: !!repo,
  });
};
