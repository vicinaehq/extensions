import { useQuery } from "@tanstack/react-query";
import { RequestError } from "@octokit/request-error";
import { octokit } from "../api/githubClient";
import { WorkflowJob, WorkflowRun } from "../types";
import { useEffect } from "react";
import { showToast, Toast } from "@vicinae/api";

const defaultValue: WorkflowJob[] = [];

export const useGetWorkflowRunJobs = (workflowRun: WorkflowRun | null) => {
  const query = useQuery({
    queryKey: ["githubWorkflowRunJobs", workflowRun?.id],
    queryFn: async () => {
      if (!workflowRun) return defaultValue;
      const fullName = workflowRun.repository?.full_name;
      if (!fullName) return defaultValue;
      const [owner, repo] = fullName.split("/");
      try {
        const response = await octokit.actions.listJobsForWorkflowRun({
          owner,
          repo,
          run_id: workflowRun.id,
          per_page: 100,
        });
        return response.data.jobs;
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
    enabled: !!workflowRun?.id,
  });

  useEffect(() => {
    if (workflowRun?.status === "completed") return;
    query.refetch();
  }, [workflowRun]);

  return query;
};
