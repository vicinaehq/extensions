import { Color, Icon, ImageLike } from "@vicinae/api";
import { WorkflowJob, WorkflowRun } from "../types";

const inProgressStatuses = ["queued", "in_progress"];

export const getWorkflowJobsProgressIcon = (workflowJobs: WorkflowJob[]) => {
  const totalJobs = workflowJobs.length;
  if (totalJobs === 0) return Icon.CircleProgress;

  const completedJobs = workflowJobs.filter(
    (workflowJob) => workflowJob.status === "completed",
  ).length;

  const normalizedProgress = Math.min(
    4,
    Math.floor((completedJobs / totalJobs) * 4),
  );

  if (normalizedProgress >= 4) return Icon.CircleProgress100;
  if (normalizedProgress === 3) return Icon.CircleProgress75;
  if (normalizedProgress === 2) return Icon.CircleProgress50;
  if (normalizedProgress === 1) return Icon.CircleProgress25;

  return Icon.Circle;
};

export const getWorkflowRunIcon = (
  workflow: WorkflowRun,
  workflowJobs: WorkflowJob[],
): ImageLike => {
  if (
    workflowJobs.length > 0 &&
    inProgressStatuses.includes(workflow.status || "")
  ) {
    return {
      source: getWorkflowJobsProgressIcon(workflowJobs),
      tintColor: Color.Orange,
    };
  }

  if (workflow.status === "completed" && workflow.conclusion === "success") {
    return {
      source: Icon.CheckCircle,
      tintColor: Color.Green,
    };
  }

  if (workflow.status === "completed" && workflow.conclusion === "failure") {
    return {
      source: Icon.XMarkCircle,
      tintColor: Color.Red,
    };
  }

  return Icon.CircleProgress;
};
