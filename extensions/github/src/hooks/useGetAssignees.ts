import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Assignee, Repository } from "../types";
import { octokitPaginate } from "../api/octokitPaginate";

const defaultValue: Assignee[] = [];
export const useGetAssignees = (repo: Repository | null) => {
  return useQuery<Assignee[]>({
    queryKey: ["githubAssignees", repo?.id],
    queryFn: async () => {
      if (!repo) return defaultValue;
      const [owner, repoName] = repo.full_name.split("/");
      const assignees = await octokitPaginate(octokit.issues.listAssignees, {
        owner,
        repo: repoName,
        per_page: 100,
      });
      return assignees;
    },
    enabled: !!repo,
  });
};
