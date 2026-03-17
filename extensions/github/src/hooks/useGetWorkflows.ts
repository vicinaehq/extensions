import { useQuery } from "@tanstack/react-query";
import { octokit } from "../api/githubClient";
import { Repository, WorkflowRun } from "../types";
import { useEffect } from "react";

const defaultValue: WorkflowRun[] = [];
export const useGetWorkflows = (repo: Repository | null) => {
  const query = useQuery({
    queryKey: ["githubWorkflowRuns", repo?.id],
    queryFn: async () => {
      if (!repo) return defaultValue;
      const [owner, repoName] = repo.full_name.split("/");
      const response = await octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo: repoName,
        per_page: 50,
      });

      return response.data.workflow_runs;
    },
    enabled: !!repo,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      query.refetch();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return query;
};
