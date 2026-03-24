import {
  Action,
  ActionPanel,
  Color,
  Icon,
  ImageLike,
  List,
} from "@vicinae/api";
import { useState } from "react";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useGetMyRepos } from "./hooks/useGetRepos";
import { useGetWorkflowRunJobs } from "./hooks/useGetWorkflowRunJobs";
import { useGetWorkflows } from "./hooks/useGetWorkflows";
import { persister, queryClient } from "./queryClient";
import type { Repository, WorkflowJob, WorkflowRun } from "./types";

function PullRequests() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <Command />
    </PersistQueryClientProvider>
  );
}

function Command() {
  const [repo, setRepo] = useState<Repository | null>(null);

  const { data: workflows = [], isLoading, isFetching } = useGetWorkflows(repo);
  const { data: repos = [] } = useGetMyRepos();

  return (
    <List
      isLoading={isLoading || isFetching}
      searchBarPlaceholder="Filter by title, number, or assignee"
      searchBarAccessory={
        <List.Dropdown
          storeValue={true}
          value={repo?.full_name}
          onChange={(newValue) => {
            const selectedRepo =
              repos.find((r) => r.full_name === newValue) || null;
            setRepo(selectedRepo);
          }}
        >
          <List.Dropdown.Section title="Repositories">
            {repos.map((repo) => (
              <List.Dropdown.Item
                key={repo.id}
                title={repo.name}
                icon={repo?.owner?.avatar_url}
                value={repo.full_name}
              />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {workflows.map((workflow) => (
        <WorkFlowListItem key={workflow.id} workflow={workflow} />
      ))}
    </List>
  );
}

const WorkFlowListItem = ({ workflow }: { workflow: WorkflowRun }) => {
  let icon: ImageLike = Icon.CircleProgress;
  if (workflow.status === "completed" && workflow.conclusion === "success") {
    icon = {
      source: Icon.CheckCircle,
      tintColor: Color.Green,
    };
  }
  if (workflow.status === "completed" && workflow.conclusion === "failure") {
    icon = {
      source: Icon.XMarkCircle,
      tintColor: Color.Red,
    };
  }
  const { data: jobs = [], refetch } = useGetWorkflowRunJobs(workflow);
  if (
    jobs.length > 0 &&
    ["queued", "in_progress"].includes(workflow.status || "")
  ) {
    icon = {
      source: getWorkflowJobsProgressIcon(jobs),
      tintColor: Color.Orange,
    };
  }
  return (
    <List.Item
      key={workflow.id}
      title={workflow.name || "Untitled Workflow"}
      subtitle={workflow.head_commit?.message}
      accessories={[
        {
          tag: {
            color: Color.SecondaryText,
            value: workflow.head_branch,
          },
        },
      ]}
      icon={icon}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open in Browser"
            url={workflow.html_url}
          />
          <Action.CopyToClipboard
            title="Copy URL"
            content={workflow.html_url}
          />
          <Action.CopyToClipboard
            title="Copy Workflow ID"
            content={`#${workflow.id}`}
            shortcut={{ modifiers: ["ctrl"], key: "c" }}
          />
          <Action
            title="Refresh"
            onAction={() => refetch()}
            icon={Icon.ArrowClockwise}
            shortcut={{
              modifiers: ["ctrl"],
              key: "r",
            }}
          />
        </ActionPanel>
      }
    />
  );
};

const getWorkflowJobsProgressIcon = (workflowJobs: WorkflowJob[]) => {
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

export default PullRequests;
