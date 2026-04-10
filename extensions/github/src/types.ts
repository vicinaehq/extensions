import { RestEndpointMethodTypes } from "@octokit/rest";

export type GitHubPreferences = {
  personalAccessToken: string;
  numberOfResults?: string;
  defaultIssueFilter?: FilterType;
};

export type GitHubPreferencesMinimal = {
  personalAccessToken: string;
  numberOfResults?: string;
};

export type FilterType = "my" | "assigned" | "mentioning";

export type Repository =
  RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][number];
export type RepositoryDetails =
  RestEndpointMethodTypes["repos"]["get"]["response"]["data"];
export type Assignee =
  RestEndpointMethodTypes["issues"]["listAssignees"]["response"]["data"][number];
export type Label =
  RestEndpointMethodTypes["issues"]["listLabelsForRepo"]["response"]["data"][number];
export type Branch =
  RestEndpointMethodTypes["repos"]["listBranches"]["response"]["data"][number];
export type WorkflowRun =
  RestEndpointMethodTypes["actions"]["listWorkflowRunsForRepo"]["response"]["data"]["workflow_runs"][number];
export type WorkflowJob =
  RestEndpointMethodTypes["actions"]["listJobsForWorkflowRun"]["response"]["data"]["jobs"][number];
export type Issue =
  RestEndpointMethodTypes["search"]["issuesAndPullRequests"]["response"]["data"]["items"][number];
export type PullRequest =
  RestEndpointMethodTypes["search"]["issuesAndPullRequests"]["response"]["data"]["items"][number];
