import { RestEndpointMethodTypes } from "@octokit/rest";

export type GitHubPreferences = {
  personalAccessToken: string;
  numberOfResults?: string;
  defaultIssueFilter?: "my" | "assigned" | "mentioning" | "all";
};

export type GitHubPreferencesMinimal = {
  personalAccessToken: string;
  numberOfResults?: string;
  defaultRepositoryFilter?: "all" | "my";
};

export type FilterType = "my" | "assigned" | "mentioning" | "all";

export type Repository =
  RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][number];
export type Assignee =
  RestEndpointMethodTypes["issues"]["listAssignees"]["response"]["data"][number];
export type Label =
  RestEndpointMethodTypes["issues"]["listLabelsForRepo"]["response"]["data"][number];
