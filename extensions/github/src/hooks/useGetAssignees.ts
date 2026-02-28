import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Assignee, Repository } from "../types";

export const useGetAssignees = (repo?: Repository) => {
  return useQuery<Assignee[]>({
    queryKey: ["githubAssignees", repo?.id],
    queryFn: async () => {
      if (!repo) return [];
      const [owner, repoName] = repo.full_name.split("/");
      const assignees = await octokit.paginate(octokit.issues.listAssignees, {
        owner,
        repo: repoName,
        per_page: 100,
      });
      return assignees;
    },
    enabled: !!repo,
  });
};
