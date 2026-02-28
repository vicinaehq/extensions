import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Label, Repository } from "../types";

export const useGetLabels = (repo?: Repository) => {
  return useQuery<Label[]>({
    queryKey: ["githubLabels", repo?.id],
    queryFn: async () => {
      if (!repo) return [];
      const [owner, repoName] = repo.full_name.split("/");
      const labels = await octokit.paginate(octokit.issues.listLabelsForRepo, {
        owner,
        repo: repoName,
        per_page: 100,
      });

      return labels;
    },
    enabled: !!repo,
  });
};
