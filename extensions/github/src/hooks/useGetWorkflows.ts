import { useQuery } from "@tanstack/react-query";
import { RequestError } from "@octokit/request-error";
import { octokit } from "../api/githubClient";
import { Repository, WorkflowRun } from "../types";
import { useEffect } from "react";
import { showToast, Toast } from "@vicinae/api";

const defaultValue: WorkflowRun[] = [];
export const useGetWorkflows = (repo: Repository | null) => {
  const query = useQuery({
    queryKey: ["githubWorkflowRuns", repo?.id],
    queryFn: async () => {
      if (!repo) return defaultValue;
      const [owner, repoName] = repo.full_name.split("/");
      try {
        const response = await octokit.actions.listWorkflowRunsForRepo({
          owner,
          repo: repoName,
          per_page: 50,
        });
        return response.data.workflow_runs;
      } catch (error) {
        if (error instanceof RequestError) {
          showToast({
            title: error.message,
            style: Toast.Style.Failure,
          });
        }
        return defaultValue;
      }
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
